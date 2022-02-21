import sequelize from "sequelize";
import db from "../../../../db/models";
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";
import attributes from "../../../../helpers/utils/attributes.js";

const {Op} = sequelize
const {INVALID_DATA} = constants
const {Shipping_Include, AOrder} = attributes

const getOrderGrouped = async (userId, {offset, limit, search}) => {
  const {count, rows} = await db.order.findAndCountAll({
    where: {
      parent_id: {[Op.or]: [null, 0]},
      user_id: userId,
      status: {[Op.or]: ['paid', 'in_work', 'complete', 'suspended', 'test']},
      ...(search ? {
        [Op.or]: [
          {[`$card.name$`]: search},
          {[`$address_to.name$`]: search},
          {[`$address_to.last_name$`]: search},
          {[`$address_to.first_name$`]: search},
          {[`$children->address_to.name$`]: search},
          {[`$children->address_to.last_name$`]: search},
          {[`$children->address_to.first_name$`]: search},
        ]
      } : {})
    },
    attributes: [...AOrder, Shipping_Include],
    include: [
      {
        model: db.order,
        as: 'children',
        include: [
          {
            model: db.card,
            attributes: ['id', 'name', 'cover', 'price', 'category_id', 'quantity'],
            include: [
              {model: db.category},
            ],
          },
          {
            model: db.address,
            as: 'address_from',
            where: {
              type: 'order_from'
            }
          },
          {
            model: db.address,
            as: 'address_to',
            where: {
              type: 'order_to',
            }
          },
          {
            model: db.signatures,
            as: 'signatures',
          },
          {
            model: db.signatures,
            as: 'signatures2',
          },
          {
            model: db.inserts,
          },
        ],
      },
      {
        required: false,
        model: db.order_shipping_details,
        attributes: ['order_id'],
        as: 'shipping_details',
        include: [
          {model: db.shipping_rates},
          {model: db.shipping_methods},
          {model: db.address},
        ]
      },
      {
        model: db.card,
        include: [
          {
            model: db.category,
            attributes: ['name']
          },
        ],
      },
      {
        required: false,
        model: db.address,
        as: 'address_from',
        where: {
          type: 'order_from'
        }
      },
      {
        required: false,
        model: db.address,
        as: 'address_to',
        where: {
          type: 'order_to'
        }
      },
      {
        model: db.inserts,
      },
      {
        required: false,
        model: db.denomination,
        include: {model: db.gcard}
      },
      {
        model: db.signatures,
        as: 'signatures',
      },
      {
        model: db.signatures,
        as: 'signatures2',
      },
      {
        model: db.fonts,
        as: 'fontInfo',
      },
      {
        model: db.card_order,
        as: 'basket',
      }
    ],
    limit,
    offset,
    order: [['id', 'DESC']],
    // group: ['id'],

    subQuery: false,
    distinct: true,
  })

  return {
    parentOrders: JSON.parse(JSON.stringify(rows, null, 4)),
    count,
  }
}

const getPayOrder = async (order_id, user_id) => {
  const order = await db.order.findOne({
    where: {
      id: order_id,
      user_id,
      status: 'new',
    },
    include: [
      {
        model: db.card,
        as: 'cards',
        through: {attributes: []},
      },
      {
        model: db.card,
        include: [
          {
            model: db.category
          }
        ]
      },
      {
        model: db.basket,
        as: 'basketOrders',
        through: {attributes: []},
      },
      {
        model: db.address,
      },
      {
        model: db.denomination,
        include: [
          {model: db.gcard}
        ]
      },
      {
        model: db.inserts,
      },
      {
        model: db.fonts,
        as: 'fontInfo',
        attributes: ['id', 'label'],
      },
      {
        model: db.order,
        as: 'children',
        include: [
          {
            model: db.address,
          },
          {
            model: db.denomination,
            include: [
              {model: db.gcard}
            ]
          },
          {
            model: db.inserts
          }
        ]
      }
    ]
  })

  if (!order) {
    throw new ErrorHandler(INVALID_DATA, 'no such order')
  }

  return JSON.parse(JSON.stringify(order, null, 4))
}
const checkQuantityWithInsert = (user, order_id, insert_id) => db.sequelize.query(`select sum(co.quantity) as qntl
       from \`order\`
       join card_order co on \`order\`.id = co.order_id
       join order_inserts oi on \`order\`.id = oi.order_id
           where 
           ${order_id?
  `
           user_id =:user_id
           and oi.insert_id =:insert_id
           and sort_id!=:sort_id
           and co.order_id!=:order_id
           and status='basket'
           `:
  `
           oi.insert_id =:insert_id
           and user_id =:user_id
           and status='basket'
           `}
`, {
  type: db.Sequelize.QueryTypes.SELECT,
  replacements: {
    user_id: user.id || 0,
    insert_id: insert_id || 0,
    sort_id: order_id || null,
    order_id: order_id || null,
  },
})

const checkQuantity = (orderId, user, card_id) => db.sequelize.query(`select sum(co.quantity) as qntl
       from \`order\`
       join card_order co on \`order\`.id = co.order_id
           where 
           ${orderId?
           `
           user_id =:user_id
           and co.card_id=:card_id
           and sort_id!=:sort_id
           and co.order_id!=:order_id
           and status='basket'
           `:
           `
           user_id =:user_id
           and co.card_id=:card_id
           and status='basket'
           `}
`, {
  type: db.Sequelize.QueryTypes.SELECT,
  replacements: {
    user_id: user.id || 0,
    card_id: +card_id || 0,
    sort_id: orderId || null,
    order_id: orderId || null,
  },
})

const getAddressFromOrder = (user) => db.order.findOne({
  where: {
    status: 'basket',
    user_id: user.id,
    parent_id: {[Op.not]: null},
  },
  raw: true,
  nest: true,
  include: [
    {
      model: db.address,
    },
  ],
})


const getChildren = (order) => db.order.findAll({
  where: {
    parent_id: order.id,
  },
  include: [
    {model: db.address, where: {type: 'order_to'}, as: 'address_to'},
    {model: db.address, where: {type: 'order_from'}, as: 'address_from'},
    {
      model: db.denomination,
      include: {
        model: db.gcard,
      }
    },
    {
      model: db.fonts,
      as: 'fontInfo'
    },
    {model: db.card}
  ],

  raw: true,
  nest: true,
})

const getCardOrder = (orderId, userId) => db.order.findOne({
  where: {
    id: orderId,
    user_id: userId,
    status: {
      [Op.or]: ['basket', 'paid', 'in_work', 'complete', 'suspended', 'test'],
    },
  },
  include: [
    {
      model: db.card_order,
      as: 'basket',
      include: [
        {
          model: db.card,
        },
      ],
    },
  ],
  raw: true,
  nest: true,
})

const getOrderDetails = (orderId, userId) => db.order.findOne({
  where: {
    id: orderId,
    user_id: userId,
    status: {
      [Op.or]: ['basket', 'paid', 'in_work', 'complete', 'suspended', 'test'],
    },
  },
  include: [
    {
      model: db.order,
      as: 'children',
      include: [
        {
          model: db.denomination,
          attributes: ['price'],
        },
        {
          model: db.inserts,
          through: {attribute: []},
          attribute: ['id', 'name', 'price', 'insert_id'],
        },
        {
          model: db.card_order,
          as: 'basket',
          include: [
            {
              required: false,
              model: db.address,
              as: 'addressFrom',
              where: {
                type: 'order_from'
              }
            },
            {
              required: false,
              model: db.address,
              as: 'addressTo',
              where: {
                type: 'order_to'
              }
            }
          ]
        },
        {
          required: false,
          model: db.address,
          as: 'address_to',
          where: {
            type: 'order_to'
          }
        },
        {
          required: false,
          model: db.address,
          as: 'address_from',
          where: {
            type: 'order_from'
          }
        },
      ],
    },
    {
      model: db.card,
      include: {
        model: db.category
      }
    },
    {
      model: db.denomination,
      attribute: ['id', 'nominal', 'price'],
      include: [
        {
          model: db.gcard,
          attribute: ['id', 'name', 'image'],
        },
      ],
    },
    {
      model: db.inserts,
      through: {attribute: []},
      attribute: ['id', 'name', 'price', 'insert_id'],
    },
    {
      model: db.signatures,
      as: 'signatures'
    },
    {
      model: db.signatures,
      as: 'signatures2'
    },
    {
      model: db.card_order,
      as: 'basket',
      include: [
        {
          required: false,
          model: db.address,
          as: 'addressFrom',
          where: {
            type: 'order_from'
          }
        },
        {
          required: false,
          model: db.address,
          as: 'addressTo',
          where: {
            type: 'order_to'
          }
        }
      ]
    },
    {
      required: false,
      model: db.address,
      as: 'address_to',
      where: {
        type: 'order_to'
      }
    },
    {
      required: false,
      model: db.address,
      as: 'address_from',
      where: {
        type: 'order_from'
      }
    },
    {
      model: db.fonts,
      as: 'fontInfo'
    },
  ],
})


const getSingleStepOrder = (order_id, user_id) => db.order.findOne({
  where: {
    id: order_id,
    user_id,
  }
})


export const orderService = {
  checkQuantityWithInsert,
  getAddressFromOrder,
  getSingleStepOrder,
  getOrderGrouped,
  getOrderDetails,
  checkQuantity,
  getCardOrder,
  getPayOrder,
  getChildren
}
