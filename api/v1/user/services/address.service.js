import sequelize from "sequelize";
import lodash from "lodash";

import db from "../../../../db/models";
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";
import {simpleCreateEntity, simpleUpdateEntity} from "../../../../helpers/utils/model.utils.js";

const {INVALID_DATA} = constants

const {Op} = sequelize

const findAddress = (user_id) => db.address.findAll({
  where: {
    user_id,
    type: 'user_to'
  },
  raw: true,
  nest: true
})

/**
 * Get user address
 * @param {number} uId - an address id
 * @param {string} listType - a type of address
 * @returns {Promise<Model[]|any[]>}
 */
const listForType = (uId, listType) => db.address.findAll({
  where: {
    type: listType === 'user' ? 'user_from' : 'user_to',
    user_id: uId,
  },
  include: [
    {
      model: db.country,
      as: 'country_obj',
      attributes: ['id', 'name', 'delivery_cost'],
    },
  ],
  raw: true,
  nest: true,
  order: [['date_created']],
})

/**
 * Get user address
 * @param {number} addressId - an address id
 * @returns {Promise<Model|any>}
 */
const getUserAddress = (addressId) => db.address.findByPk(addressId, {
  include: [
    {
      model: db.country,
      as: 'country_obj',
      attributes: ['id', 'name', 'delivery_cost'],
    },
  ],
  raw: true,
  nest: true
})

const createAddressList = (address) => db.sequelize.query(`INSERT INTO \`address\` (user_id,type,name,first_name,last_name,business_name,address1,address2,city,state,zip,country,birthday) VALUES :list `, {
  type: db.Sequelize.QueryTypes.INSERT,
  replacements: {
    list: address
  },
})

const createAddressOrder = (address, t) => db.sequelize.query(`INSERT INTO \`address\` (user_id,type,name,first_name,last_name,business_name,address1,address2,city,state,zip,country_id,country,delivery_cost,birthday,ext_id) VALUES :list `, {
  type: db.Sequelize.QueryTypes.INSERT,
  transaction: t,
  replacements: {
    list: address
  },
})

const getAddressByID = async (address_id, user_id) => {
  const address = await db.address.findOne({
    where: {
      id: address_id,
      user_id,
      type: 'user_to',
    },
    raw: true,
  })

  if (!address) {
    throw new ErrorHandler(INVALID_DATA, 'error placing order (recipient address not found)')
  }
  return address
}

const getAddressesByIds = async (user_id, address_ids) => await db.address.findAll({
  where: {
    user_id,
    type: 'user_to',
    id: {[Op.or]: address_ids},
  },
  raw: true,
})

const getOrderAddress = async (id, type = 'order_from', user_id = null, order_id) => await db.address.findOne({
  where: {
    ...(order_id ? {order_id} : {}),
    ...(id ? {id} : {}),
    type,
    ...(user_id ? {user_id} : {})
  },
  raw: true,
})

const setOrderAddress = (address, order, type, t) => {

  const {id = null, basket_id = null, date_updated, date_created, ...rest} = address

  return simpleCreateEntity('address', {
    ...rest,
    order_id: order.id,
    type,
    address_id: id,
    date_updated: new Date(),
    ...(order.basket || order.basket_id || address.basket_id ? {basket_id: order.basket_id || address.basket_id} : {}),
  }, t)
}

const getCountry = (id) => db.country.findOne({
  where: {
    [Op.or]:
      [
        {id},
      ]
  }
})

const getCountries = () => db.country.findAll({raw: true, nest: true})


const getCountyByAlias = (alias) => db.country.findOne({
  where: {
    name: `%${alias}%`,
    aliases: `%${alias}%`,
  },
  raw: true,
  nest: true
})

const updateAddress = async (user, address, t) => {
  let response;

  if (!lodash.isEmpty(address)) {
    response = await simpleCreateEntity('address', {user_id: user.id, type: 'user_from', ...address}, t);
  } else if (user.default_return_address_id) {
    response = await getOrderAddress(user.default_return_address_id, 'user_from', user.id)
  }

  if (!user.default_return_address_id && response) {
    await simpleUpdateEntity('user', {id: user.id}, {default_return_address_id: response.id}, t)
  }
  return response ? response : false
}

export const addressesService = {
  getCountry,
  getCountries,
  findAddress,
  listForType,
  getAddressByID,
  getUserAddress,
  getOrderAddress,
  setOrderAddress,
  createAddressList,
  getAddressesByIds,
  createAddressOrder,
  updateAddress,
  getCountyByAlias
}
