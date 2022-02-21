import sequelize from "sequelize";

import db from "../../../../db/models";
import attributes from '../../../../helpers/utils/attributes.js'

const {
  ABasketOrder,
  AOrderChildren,
  ACardForOrder,
  AFontInfo,
  AOrderForBasket,
  AOrder,
  AAddress,
  ACardOrder,
  ACategoryName,
  Shipping_Include
} = attributes
const {Op} = sequelize

const getBasketOrdersByUserId = async (userId, limit = 10) => {
  const {count, rows} = await db.order.findAndCountAll({
    where: {
      user_id: userId,
      status: 'basket',
      parent_id: null
    },
    attributes: [...ABasketOrder, Shipping_Include],
    include: [
      {
        required: false,
        model: db.order,
        attributes: AOrderChildren,
        as: 'children',
        where: {
          status: 'basket'
        },
        include: [
          {
            model: db.denomination,
            attributes: ['id', 'nominal', 'price'],
            include: {
              model: db.gcard,
              attributes: ['id', 'image', 'name']
            }
          },
          {
            model: db.inserts
          },
          {
            model: db.address
          },
          {
            model: db.card,
          },
        ]
      },
      {
        required: false,
        model: db.order_shipping_details,
        as: 'shipping_details',
        include: [
          {model: db.shipping_methods},
          {model: db.shipping_rates},
          {model: db.address},
        ]
      },
      {
        model: db.signatures,
        as: 'signatures',
      },
      {
        model: db.address
      },
      {
        model: db.signatures,
        as: 'signatures2',
      },
      {
        model: db.inserts
      },
      {
        model: db.denomination,
        attributes: ['id', 'nominal', 'price'],
        include: {
          model: db.gcard,
          attributes: ['id', 'image', 'name']
        }
      },
      {
        model: db.card,
      },
      {
        model: db.fonts,
        as: 'fontInfo',
        attributes: ['id', 'label']
      },
      {
        model: db.card_order,
        attributes: ['id', 'price', 'order_id', 'card_id', 'quantity', 'font', 'for_free'],
        include: [
          {
            model: db.card,
            attributes: ['id', 'name', 'cover', 'cover_width', 'cover_height', 'quantity'],
            include: {
              model: db.category,
              attributes: ['name']
            }
          },
          {
            model: db.fonts,
            as: 'fontInfo',
            attributes: ['id', 'label']
          },
          {
            model: db.denomination,
            attributes: ['id', 'nominal', 'price'],
            include: {
              model: db.gcard,
              attributes: ['id', 'image', 'name']
            }
          },
          {
            model: db.address
          }
        ]
      }
    ],
  })
  return {
    count: rows.length,
    orders: JSON.parse(JSON.stringify(rows, null, 4))
  }
}

const getUserBasketOrders = async (userId) => {
  const orders = await db.order.findAll({
    where: {
      parent_id: {[Op.or]: [null, 0]},
      user_id: userId,
      status: 'basket'
    },
    attributes: AOrderForBasket,
    include: [
      {
        model: db.order,
        as: 'children',
        where: {
          status: 'basket'
        },
        separate: true,
        attributes: AOrderForBasket,
        include: [
          {
            separate: true,
            required: false,
            model: db.address,
          },
          {
            required: false,
            model: db.inserts,
            attributes: [
              'id',
              'price',
              'name',
            ]
          },
          {
            model: db.card,
            attributes: ACardForOrder,
            include: {
              model: db.card_image,
              as: 'totalImages'
            }
          },
          {
            required: false,
            model: db.denomination,
            attributes: ['id', 'nominal', 'price'],
            include: {
              model: db.gcard,
              attributes: ['id', 'image', 'name']
            }
          },
        ]
      },
      {
        model: db.inserts,
        attributes: [
          'id',
          'price',
          'name',
        ]
      },
      {
        model: db.fonts,
        as: 'fontInfo',
        attributes: AFontInfo
      },
      {
        model: db.denomination,
        attributes: ['id', 'nominal', 'price'],
        include: {
          model: db.gcard,
          attributes: ['id', 'image', 'name']
        }
      },
      {
        required: false,
        model: db.signatures,
        as: 'signatures'
      },
      {
        required: false,
        model: db.signatures,
        as: 'signatures2'
      },
      {
        model: db.card,
        attributes: ACardForOrder,
        include: {
          model: db.card_image,
          as: 'totalImages'
        }
      },
      {
        required: false,
        model: db.address,
        include: {
          model: db.country,
          as: 'country_obj',
          attributes: ['id', 'name', 'delivery_cost'],
        }
      },
    ],
    order: [['sort_id', 'ASC'], ['id', 'ASC']]
  })
  return JSON.parse(JSON.stringify(orders, null, 4))
}

const getAllGrouped = async (user) => {
  const response = await db.order.findAll({
    where: {
      user_id: user.id,
      status: 'basket',
      parent_id: {[Op.or]: [null, 0]},
      card_id: {[Op.not]: null}
    },
    attributes: [...AOrder, Shipping_Include],
    include: [
      {
        where: {
          status: 'basket'
        },
        limit: 9,
        model: db.order,
        as: 'children',
        required: false,
        attributes: AOrderChildren,
        include: [
          {
            required: false,
            model: db.address,
            attributes: AAddress
          }
        ]
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
        model: db.fonts,
        as: 'fontInfo'
      },
      {
        required: false,
        model: db.signatures,
        as: 'signatures'
      },
      {
        required: false,
        model: db.signatures,
        as: 'signatures2'
      },
      {
        model: db.card,
        attributes: ACardForOrder,
        include: [
          {
            model: db.category,
            attributes: ACategoryName,
          }
        ]
      },
      {
        required: false,
        model: db.card_order,
        attributes: ACardOrder,
      },
      {
        required: false,
        model: db.denomination,
        attributes: ['id',
          'nominal',
          'price',
          'gcard_id'],
        include: [
          {
            model: db.gcard,
          }
        ]
      },
      {
        required: false,
        model: db.address,
        attributes: AAddress
      },
      {
        required: false,
        model: db.inserts
      }
    ],
    order: [['sort_id', 'ASC'], ['id', 'ASC']]
  })
  return countChildren(JSON.parse(JSON.stringify(response, null, 4)), 'basket')
}

const countChildren = async (orders, status) => {
  const result = []
  for (const order of orders) {
    const count = await db.order.count({
      where: {
        status,
        parent_id: order.id
      }
    })
    result.push({...order, children_total: count})
  }
  return result
}
const countOrders = ({id: user_id}) => db.order.count({
  where: {
    user_id,
    status: 'basket',
    is_bulk: 0,
  },
})
export const basketService = {
  countOrders,
  getBasketOrdersByUserId,
  getUserBasketOrders,
  getAllGrouped
}
