import db from '../../db/models'
import {ErrorHandler} from '../../middlewares/error.js'
import {genUid} from './crypto.js'
import constants from '../constants/constants.js'
import sequelize from "sequelize";
import lodash from 'lodash'

const {INVALID_DATA} = constants
const {Sequelize: {Op}} = db
const operatorMap = {
  '<>': 'not',
  '<': 'lt',
  '>': 'gt',
  '<=': 'lte',
  '>=': 'gte',
}
const operatorRegexp = /^<>|<=|=>|<|>/i

// ##############
// PRIVAT METHODS
// ##############

const resolveIncludes = (options) => options.map(({model, ...other}) => ({
  model: db[model],
  ...other,
}))

/**
 * Compare an ID of an array of objects or a one single object with parent model's id.
 * @param {object|array} obj - an association model(s).
 * @param {array}  id - ad id of model to campare with.
 */
const compareIds = (obj, id) => {
  if (Array.isArray(obj)) {
    return obj.some((entity) => entity.id === id)
  }

  return obj && obj.id === id
}

const calculatePagination = (lim, off) => {
  let limit = null
  let offset = off - 1 > 0 ? off - 1 : null

  if (lim && typeof +lim === 'number' && +lim > 0) limit = +lim
  if (limit && offset && typeof offset === 'number' && offset > 0) offset *= limit

  if (!lim && !off) {
    return {
      limit: 500,
    }
  }

  return {
    limit,
    offset,
  }
}

/**
 * Process query string, includes & attributes
 * @param {object|array} obj - req.query
 * @param {object|array} attr - attributes to include or exclude (optional)
 * @param {array} includes - an array of models to receive (optional)
 * @param {string} modelName - a name of a model (optional)
 */
const constructFilter = (obj, attr, includes, modelName) => {
  if (!obj) return {}

  const {
    where, like, attrs, date, order, ...rest
  } = obj

  // if nothing -> exit
  if (!where && !like && !attrs && !order && !date && !includes) return {}

  const likeQueries = {}
  const whereQueries = {}
  const include = includes
  let denominationQuery = null
  let userQuery = null
  let addressQuery = null
  let cardQuery = null
  let attributes = null
  let orderby = null
  let dates = {}

  // DATE
  if (date) {
    if (typeof date === 'object') {
      const result = Object.entries(date).map(([field, v]) => {
        const col = modelName ? `${modelName}.${field}` : field

        return db.sequelize.where(
          db.sequelize.cast(db.sequelize.col(col), 'char'),
          {[Op.like]: `%${v}%`},
        )
      })

      dates = {
        [Op.and]: result,
      }
    } else {
      throw new ErrorHandler(INVALID_DATA, 'Wrong date query')
    }
  }

  // ORDER BY
  if (order) {
    if (typeof order === 'string') {
      const [key, direction] = order.split(',')

      if (include && include.length && include.some(({model}) => model === key)) {
        include[key].order = ['id', direction]
      } else {
        orderby = ['id', direction]
      }
    }

    if (typeof order === 'object') {
      orderby = Object.entries(order).map(([field, value]) => {
        const [key, v] = value.split(',')

        if (include) {
          const modelIndex = include.find(({model}) => model === field)
          if (modelIndex) {
            const {model} = modelIndex
            return [{model: db[model]}, key, v]
          }
        }

        if (field.includes('*date')) {
          return [field.split('*')[0], value]
        }

        if (field === 'total_images') {
          field = sequelize.literal(field)
        }
        return [field, ...value.split(',')]
      })
    }
  }

  // ATTRIBUTES
  if (attrs && typeof attrs === 'string') {
    attributes = attrs.split(',')
  }

  if (attrs && typeof attrs === 'object') {
    const {exclude} = attrs

    if (exclude) {
      attributes = {
        exclude: exclude.split(','),
      }
    }
  }

  // WHERE
  if (where) {
    const {user, card, address, denomination, ...rest} = where
    if (user) {
      userQuery = {[`$user.${user.split(',')[0]}$`]: {[Op.like]: `%${user.split(',').pop()}%`}}
    }

    if (denomination) {
      if (denomination.split(',').pop().search(operatorRegexp) >= 0) {
        const [operatorName, actualValue] = denomination.split(',').pop().split(' ')
        const action = operatorMap[operatorName]
        denominationQuery = {[`$denomination->gcard.id$`]: {[Op[action]]: +actualValue}}
      } else {
        denominationQuery = {[`$denomination->gcard.id$`]: {[Op.like]: `%${denomination.split(',').pop()}%`}}
      }
    }
    if (card) {
      cardQuery = {[`$card.${card.split(',')[0]}$`]: {[Op.like]: `%${card.split(',').pop()}%`}}
    }

    if (address) {
      addressQuery = {[`$address_to.${address.split(',')[0]}$`]: {[Op.like]: `%${address.split(',').pop()}%`}}
    }
    Object.entries(rest).forEach(([key, value]) => {
      if (key === 'total_images') {
        return
      }

      if (key === 'total_orders') {
        return
      }

      if (value === 'null') value = null

      if (Array.isArray(value) && include) {
        const modelIndex = include.findIndex(({model}) => model === key)

        if (modelIndex < 0) return

        value.forEach((val) => {
          const [k, v] = val.split(',')
          const prev = include[modelIndex].where

          include[modelIndex].where = {
            ...prev,
            [k]: {
              [Op.like]: `%${v}%`,
            },
          }
        })

        return
      }

      if (value !== null && value.search(/,/g) >= 0) {
        const splited = value.split(/,/g)
        const [field, criteria] = splited

        if (splited.length > 2) {
          whereQueries[key] = {
            [Op.or]: splited,
          }

          return
        }

        if (include) {
          const modelIndex = include.findIndex(({model}) => model === key)

          if (modelIndex >= 0) {
            const prev = include[modelIndex].where || {}

            if (criteria.search(operatorRegexp) >= 0) {
              const [operatorName, actualValue] = criteria.split(' ')
              const action = operatorMap[operatorName]

              include[modelIndex].where = {
                ...prev,
                [field]: {
                  [Op[action]]: actualValue,
                },
              }
              return
            }

            include[modelIndex].where = {
              ...prev,
              [field]: {
                [Op.like]: `%${criteria}%`,
              },
            }
            return
          }
        }

        whereQueries[key] = {
          [Op.or]: splited,
        }
        return
      }

      if (value !== null && value.search(operatorRegexp) >= 0) {
        const [operatorName, val] = value.split(' ')
        const action = operatorMap[operatorName]

        whereQueries[key] = {
          [Op[action]]: val,
        }
        return
      }

      whereQueries[key] = value
    })
  }

  const props = include ? resolveIncludes(include) : null

  // LIKE
  if (like) {
    Object.entries(like).forEach(([key, value]) => {
      if (value.search(/,/g) >= 0) {
        const variants = value.split(',')

        likeQueries[Op.or] = variants.map((v) => ({
          [key]: {
            [Op.like]: `%${v}%`,
          },
        }))
        return
      }

      if (key === 'total_images') {
        return
      }

      if (key === 'total_orders') {
        return
      }

      likeQueries[key] = {
        [Op.like]: `%${value}%`,
      }
    })
  }
  return {
    where: {
      ...whereQueries,
      ...likeQueries,
      ...dates,
      ...userQuery,
      ...cardQuery,
      ...addressQuery,
      ...denominationQuery,
    },
    attributes: attributes || attr,
    order: orderby && orderby[0] ? [orderby] : undefined,
    include: props,
    ...rest,
  }
}

const findQueryValueByKey = (query, key, value = null) => {
  if (!lodash.isObject(query)) return null;

  for (const queryKey in query) {

    if (queryKey === key) value = query[key];

    if (lodash.isObject(query[queryKey])) {
      value = findQueryValueByKey(query[queryKey], key, value);
    }
    if (value) return value;
  }
};

const findQueryKeyByInclude = (query, include, value = null) => {
  if (!lodash.isObject(query)) return null

  for (const queryKey in query) {

    if (queryKey.includes(include)) value = queryKey


    if (lodash.isObject(query[queryKey])) {
      value = findQueryKeyByInclude(query[queryKey], include, value)
    }
    if (value) return value;
  }
}
const createHavingFilter = (query) => {
  let having = {}

  //skip order by value
  delete query?.order

  const key = findQueryKeyByInclude(query, 'total_')

  if (!key) return having

  let selectLiteral;
  let wheres = []

  if (key) {
    const value = findQueryValueByKey(query, key);
    const [, model] = key.split('_');

    switch (model) {
      case 'images':
        selectLiteral = sequelize.literal('(SELECT COUNT(*) FROM `card_image` where card_image.card_id=card.id)');
        break;
      case 'orders':
        selectLiteral = sequelize.literal('(SELECT COUNT(*) FROM `order` where order.user_id=user.id )');
        break;
      default:
        break;
    }

    if (!selectLiteral) return having

    if (value.search(operatorRegexp) !== -1) {
      const [operatorName, actualValue] = value.split(' ');
      const action = operatorMap[operatorName];

      wheres.push(sequelize.where(selectLiteral, key, {[Op[action]]: +actualValue}))

    } else if (value.includes('=')) {
      const [, actualValue] = value.split(' ');

      wheres.push(sequelize.where(selectLiteral, key, {[Op.like]: +actualValue}))

    } else {
      wheres.push(sequelize.where(selectLiteral, key, {[Op.like]: +value}))
    }

  }

  having = wheres ? {[Op.or]: wheres} : {}

  return {having}
}
// ##############
// PUBLIC METHODS
// ##############

/**
 * Creates a transaction and pass to callback
 * @param {function} cb - a callback
 */
const transaction = (cb) => db.sequelize.transaction((t) => cb(t))

/**
 * Process query string, includes & attributes
 * @param {object|array} obj - req.query object. (main)
 * @param {object|array} attributes - attributes to include or exclude (optional)
 * @param {array} include - an array of models to receive (optional)
 * @param {string} modelName - a name of a model (optional)
 */
const destructQueries = ((obj, attributes, include, modelName) => {
  if (obj) {
    const {limit, offset, ...rest} = obj
    return {
      ...calculatePagination(limit, offset),
      ...constructFilter(rest, attributes, include, modelName),
    }
  }
  return attributes || null
})


const generateIncludeByQuery = (query) => {
  const include = []
  if (findQueryValueByKey(query, 'card')) {
    include.push({
      model: db.card,
      attributes: ['name', 'id'],
    })
  }

  if (findQueryValueByKey(query, 'address')) {
    include.push({
      model: db.address,
      as: 'address_to',
      where: {type: 'order_to'},
      required: false,
      attributes: ['country_id', 'name', 'type'],
    })
  }
  if (findQueryValueByKey(query, 'denomination')) {
    include.push({
      model: db.denomination,
      attributes: ['gcard_id'],
      include: {
        model: db.gcard,
        attributes: ['id', 'image', 'name']
      }
    })
  }

  if (findQueryValueByKey(query, 'user')) {
    include.push(
      {
        model: db.user,
        attributes: [['login', 'name'], 'id'],
      },
    )
  }

  if (findQueryValueByKey(query, 'employee')) {
    include.push({
      model: db.employee,
      attributes: [['username', 'name'], 'id'],
    })
  }

  if (findQueryValueByKey(query, 'inserts')) {
    include.push({
      model: db.inserts,
      attributes: ['id', 'name', 'price'],
      through: {attributes: []},
    })
  }

  return lodash.isEmpty(include) ? [] : include;
}


const createDefaultOrder = (model) => {
  let field = null
  switch (model) {
    case 'category':
      field = 'name'
      break;
    case 'user_groups':
      field = 'title'
      break;
    default:
      break
  }

  return field ? {order: [[field, 'ASC']]} : {}
}

/**
 * Finds a records by multiple criterias
 * @param {string} name - a name of a table to search in
 * @param {string|number} id - find a single record by ID
 * @param {object} where - an object of props to find with
 * @param {array} include - an array of objects with names of related tables
 * @param {object} queries - req.query
 * @param {array} attributes - an array of attributes to include or exclude
 */
const findEntity = async (name, id, where, include, queries, attributes) => {
  if (id) {
    const props = include ? resolveIncludes(include) : null
    return db[name]
      .findByPk(id, {
        include: props,
        attributes,
      })
  }

  if (where) {
    const props = include ? resolveIncludes(include) : null
    return db[name]
      .findOne({
        where,
        attributes,
        include: props,
        plain: true,
      })
  }

  const {rows, count} = await db[name]
    .findAndCountAll({
      subQuery: false,
      ...destructQueries(queries, attributes, include, name),
      distinct: true,
      col: 'id',
    })

  const {offset} = queries || 1

  return {
    rows,
    page: +offset || 1,
    total: count,
  }
}

/**
 * create a token (random 32 str) for a model by id
 * @param {string|number} id - find a single record by ID
 * @param {string} model - model name to define a field name
 */
const genToken = (id, model) => transaction(async (t) => {
  const newtoken = genUid()
  const prop = model === 'employee' ? 'api_token' : 'token'

  await db[model].update({
    [prop]: newtoken,
  }, {
    where: {id},
    transaction: t,
  })

  return newtoken
})

/**
 * Compare and list models for a specific record (id)
 * @param {string} model - model name
 * @param {string|number} modelId - find a single record by ID
 * @param {string} relation - name of a related table to list
 * @param {string} alias - (optional) an alias of related table if specified
 */
const listRelations = async (model, modelId, relation, alias) => {
  // find by id + related records
  const assocs = await db[model].findByPk(modelId, {
    include: [{
      model: db[relation],
      as: alias || relation,
    }],
    // attributes: [],
  })

  if (!assocs) return false

  // find all records in the relation table
  const allAssocs = await db[relation].findAll({raw: true, ...createDefaultOrder(relation)})

  // compare each record whether it matchs with included records in model we've got by id
  const relationList = allAssocs.map(({id, name, title}) => ({
    id,
    name: name || title,
    value: compareIds(assocs[alias || relation], id), // true|false
  }))

  // cut of includes from an object to put them separate in return obj
  const {dataValues: {[alias || relation]: removed, ...entityObj}} = assocs

  return {
    [model]: assocs,
    [alias || relation]: relationList,
  }
}

// TODO describe method
/**
 * Similar to @listRelations but more for more complex cases
 * Compare and list models for a specific record (id)
 * @param {string} model - model name
 * @param {???} modelToList - find a single record by ID
 * @param {???} joinTable - name of a related table to list
 * @param {???} idField - (optional) an alias of related table if specified
 * @param {???} modelId - (optional) an alias of related table if specified
 */
const createCheckList = async (model, modelToList, joinTable, idField, modelId) => {
  // find all records
  const toList = await db[modelToList].findAll({
    raw: true,
    ...createDefaultOrder(modelToList),
  })

  // find a record by id + included (related) records
  const checked = await db[model].findByPk(modelId, {
    include: [{
      model: db[joinTable],
      as: joinTable,
      separate: true,
    }],
  })

  if (!checked) return null

  // map each record and compare with each model from [include]
  const list = toList.map(({id, name, title}) => ({
    id,
    name: name || title,
    value: checked[joinTable].some((obj) => obj.dataValues[idField] === id),
  }))

  const {dataValues: {[joinTable]: removed, ...restData}} = checked

  return {
    // replace plural ending
    [model.replace(/s$/gi, '')]: restData,
    [modelToList]: list,
  }
}

/**
 * Update or delete records in a join table
 * @param {string} joinTableName - table name to update in
 * @param {string|number} id - an id to update records
 * @param {array} fields - an array of names of fields
 * @param {array} idArray - an array of ids to update related records
 * @param {object} t - sequelize transaction
 * @param {boolean} withDestroy - a flag for an addition records destroy
 */
const deleteOrUpdateRecords = async (joinTableName, id, fields, idArray, t, withDestroy) => {
  const [updatedModelIdFiled, relatedModelIdField] = fields

  // when update action to perfom
  if (withDestroy && idArray !== null && Array.isArray(idArray)) {
    await db[joinTableName].destroy({
      where: {
        [updatedModelIdFiled]: id,
        [relatedModelIdField]: {[db.Sequelize.Op.notIn]: [...idArray]},
      },
      transaction: t,
    })
  }

  if (idArray === null || !idArray || (idArray && !idArray.length)) return

  const records = idArray.map((recordId) => ({
    [relatedModelIdField]: +recordId,
    [updatedModelIdFiled]: +id,
  }))

  // eslint-disable-next-line consistent-return
  return db[joinTableName].bulkCreate(records, {
    ignoreDuplicates: true,
    fields: [[relatedModelIdField], [updatedModelIdFiled]],
    transaction: t,
  })
}

const update = (model, where, changes, t) => {
  if (!changes) {
    throw new ErrorHandler(INVALID_DATA, 'No changes provided.')
  }

  const {
    id, user_groups, ...rest
  } = changes

  return db[model]
    .update({
      ...rest,
    }, {
      where,
      transaction: t,
      individualHooks: true,
    })
}
/**
 * Update a single or multiple records
 * @param {string} model - name of table to update
 * @param {object} where - an object of props to identify a record for updating (WHERE)
 * @param {object} changes - an object of key/value pairs to update (VALUES)
 * @param {object} t - transaction. If not provided will be generated automatically
 */
const simpleUpdateEntity = (model, where, changes, t) => (t ? update(model, where, changes, t) : transaction((T) => update(model, where, changes, T)))

const destroy = (model, where, t) => db[model].destroy({where, transaction: t})
/**
 * Delete a single or multiple records
 * @param {string} model - name of table to update
 * @param {object} where - an object of props to identify a record for deleting (WHERE)
 * @param {object} t - transaction. If not provided will be generated automatically
 */
const deleteEntity = (model, where, t) => (t ? destroy(model, where, t) : transaction((T) => destroy(model, where, T)))

const create = (model, body, t) => db[model].create(body, {transaction: t, returning: true, raw: true, nest: true})
/**
 * Create a single or multiple records
 * @param {string} model - name of table to update
 * @param {object} body - an object of props to create a record with
 * @param {object} t - transaction. If not provided will be generated automatically
 */
const simpleCreateEntity = (model, body, t) => (t ? create(model, body, t) : transaction((T) => create(model, body, T)))

/**
 * Get a list of records by a single prop
 * @param {string} model - name of table to update
 * @param {string} prop - name of a prop to find with
 * @param {string} v - the value to find with
 * @param {object} queries - req.query or other props
 */
const getModelList = async (model, prop, v, queries) => db[model].findAll({
  where: {
    [prop]: v,
  },
  ...destructQueries(queries),
})

const isRecordExist = (model, where) => db[model]
  .findOne({
    where,
    attributes: ['id'],
    raw: true,
  })

const handleValidationError = (e) => {
  if (e.errors && e.errors[0].validatorKey === 'not_unique') {
    return `${e.errors[0].value} is already used.`
  }
  return false
}

/**
 * @param {string|number} model
 * @param {object} where - an object of props to identify a record for update (WHERE)
 */
const cloneEntity = async (model, where, changes) => {
  let data = await db[model].findOne({where, raw: true});

  if (!data) return null

  data = JSON.parse(JSON.stringify(data, null, 4));

  delete data.id
  return db[model].create({...data, ...changes}, {returning: true, raw: true, nest: true});
}

export {
  cloneEntity,
  generateIncludeByQuery,
  createHavingFilter,
  findEntity,
  destructQueries,
  genToken,
  listRelations,
  simpleUpdateEntity,
  deleteEntity,
  simpleCreateEntity,
  createCheckList,
  transaction,
  getModelList,
  deleteOrUpdateRecords,
  isRecordExist,
  handleValidationError,
  findQueryValueByKey
}
