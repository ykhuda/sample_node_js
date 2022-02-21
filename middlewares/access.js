import sequelize from "sequelize";

import {ErrorHandler} from './error.js'
import {getDataByUid} from '../api/v1/user/controllers/Users.js'
import db from '../db/models'
import validation from '../helpers/constants/validation_rules.js'
import constants from '../helpers/constants/constants.js'
import modelMap from '../helpers/constants/modelMap.js'
import {findEntity} from '../helpers/utils/model.utils.js'
import {convert} from "../helpers/utils/convert";

const {
  userRuleHeaderName,
  INVALID_DATA,
  NO_PERMISSION,
  NOT_FOUND,
  SESSION_ERROR,
  UNAUTHORIZED,
  EMPLOYEE_STATUS_ACTIVE,
  message_type,
  OK
} = constants

const {Op} = sequelize;
// Check user auth (passport)
const isAuth = async (req, res, next) => {
  if (req.isAuthenticated()) {
    return next()
  }

  const {headers: {'x-api-key': apiKey}} = req

  if (apiKey) {
    const employee = await db.employee.findOne({
      where: {
        api_token: apiKey,
      },
      raw: true,
    })

    if (!employee) return next(new ErrorHandler(NO_PERMISSION, 'Unknown Api token.'))

    req.user = employee
    return next()
  }
  return next(new ErrorHandler(SESSION_ERROR, 'Session has been expired.'))
}

/**
 * Check model for access rules
 * @param {string} access - name of a rule.
 */
const permit = (...access) =>
  // eslint-disable-next-line implicit-arrow-linebreak
  async (req, res, next) => {
    const {id} = req.user || {}
    let user = await findEntity('employee', null, {id: id || 0}, null, {raw: true});

    //delete dataValue in object
    user = JSON.parse(JSON.stringify(user, null, 4))
    const noPermissionError = {type: message_type.warning, text: 'You are not authorized to perform this action.'}

    // If no user
    if (!user || user.status !== EMPLOYEE_STATUS_ACTIVE) {
      return res.status(OK).json(noPermissionError)
    }
    // If superuser
    if (user && user.superuser) return next()

    // Map through each role and compare with user's permions
    const result = access.every((role) => {
      if (role === 'admin' && !user.superuser) return false

      // If no such role
      if (!Object.prototype.hasOwnProperty.call(user, role)) return false

      // e.g. user[role] = 0 || 1
      return user[role]
    })
    if (!result) {
      return res.status(OK).json(noPermissionError)
    }

    return next()
  }

/**
 * Compare received body with model props.
 * @param {string} model - name of model to validate.
 * @param {array}  notNull - an array of required props.
 * @param {array}  readOnly - an array of props to exclude for manipulation (id, password, .etc).
 */
const validateBody = (model, notNull, readOnly) =>
  // eslint-disable-next-line implicit-arrow-linebreak
  (req, res, next) => {
    const {body: {changes}, body} = req
    const dataObj = changes || body

    // cut of file obj.
    const {file, ...data} = dataObj
    const rules = validation[model]

    const {query: {isChangeVisible}} = req

    if (isChangeVisible && model === 'fonts') return next()

    // Do not include read only rules
    if (readOnly) {
      readOnly.forEach((rule) => delete data[rule])
    }

    if (!rules) return next()

    const errors = []
    let index = errors.length

    Object.entries(rules).forEach(([prop, rule]) => {
      // get prop value from the received data object
      const dataValue = data[prop]
      // If no value && notNull.length && the rule is required as not null
      if ((!dataValue && dataValue !== 0) && notNull && notNull.includes(prop)) {
        errors.push(`${index += 1}.Prop {${prop}} is required`)
        return
      }

      // if a rule just a string with a type we compose data value to the rule type
      // eslint-disable-next-line valid-typeof
      if (typeof rule === 'string' && dataValue && typeof dataValue !== rule) {
        // number || str
        if ((rule === 'number' && !Array.isArray(+dataValue) && +dataValue) || +dataValue === 0) return

        errors.push(`${index += 1}.Prop {${prop}} must be a ${rule}`)
        return
      }
      if (Array.isArray(rule) && dataValue) {
        // eslint-disable-next-line valid-typeof
        const includes = rule.some((r) => typeof dataValue === r)

        if (!includes) {
          const errMsg = `${index += 1}.Prop {${prop}} can be ${rule.join(' || ')} only`

          errors.push(errMsg)
        }
      }
    })

    if (errors.length) {
      return next(new ErrorHandler(INVALID_DATA, `Several errors occured: \n${errors.join('\n')}`))
    }
    return next()
  }

/**
 * Check Authorization header
 * @param {[number, string]} code - http code
 */
const checkUid = ([code, message]) =>
  async (req, res, next) => {

    if (req.isAuthenticated()) {
      return next()
    }

    // if (isDevMode()) {
    //   req.user = await db.user.findOne({where: {id: 12073}, raw: true})
    //   return next()
    // }
    const {headers: {authorization, Authorization}} = req
    const uid = authorization || Authorization;

    if (uid) {
      const user = await getDataByUid(uid)

      if (!user) {
        return next(new ErrorHandler(code, message))
      }

      req.user = user

      return next()
    }

    return next(new ErrorHandler(SESSION_ERROR, 'Session has been expired.'))
  }

/**
 * Check whether a path matches acceptable names for activity tables
 * @param {obj} req - express.request obj
 * @param {object} res - express.response obj
 * @param {function} next - express callback
 */
const checkModel = (req, res, next) => {
  const availableModels = ['client', 'employee']
  const {params: {model}} = req

  if (!availableModels.includes(model)) {
    return next(new ErrorHandler(INVALID_DATA, `A model ${model} doesn't support activity logging`))
  }

  return next()
}

/**
 * Check whether a record with id exists in db
 * @param {obj} req - express.request obj
 * @param {object} res - express.response obj
 * @param {function} next - express callback
 */
const checkIdInDb = async (req, res, next) => {
  const {url} = req
  if (url.match(/^qa/i)) return next()
  // match a name of table
  // e.g. /cards -> Project_name.card
  const match = url.match(/([a-zA-Z]+_?[a-zA-Z]+)\/(\d+)/i)

  if (match) {
    let [, plural, id] = match
    const model = plural ? modelMap[plural] : null

    if (!model || (plural && !db[model])) {
      return next(new ErrorHandler(NOT_FOUND, `Model (${model || plural}) doesn't exist in db. Check a passed param`))
    }

    if (!id) return next()

    let oldID = id;
    if (model === 'manifests') {
      req.manifest_code = id;
      id = convert.okpo.validate_check_digit(id);
      req.manifest_id = id;
    }

    const entity = await db[model].findOne({
      where: model === 'fonts' ? {font_id: id} : {id},
      raw: true,
      attributes: ['id'],
    })

    if (!entity) {
      return next(new ErrorHandler(NOT_FOUND, `A record in ${model} table with ${oldID} id doesn't exist`))
    }
  }
  return next()
}

const filterRules = (user) => Object
  .fromEntries(Object
    .entries(user.dataValues || user)
    .filter(([prop, v]) => prop.match(/^can_/im) && v > 0))

// sets to express.res User-Roles header with admin rights in JSON format
const handleRules = async (req, res, next) => {
  const {user} = req

  if (!user) {
    res.set({
      [userRuleHeaderName]: JSON.stringify({}),
      'Access-Control-Expose-Headers': userRuleHeaderName,
    })
    return next()
  }

  const updateRules = await db.employee.findByPk(user.id, {raw: true});

  const {superuser} = updateRules

  if (superuser) {
    res.set({
      [userRuleHeaderName]: JSON.stringify({superuser: 1}),
      'Access-Control-Expose-Headers': userRuleHeaderName,
    })

    return next()
  }

  // Retrieve rules from employee
  const rules = filterRules(updateRules)

  res.set({
    [userRuleHeaderName]: JSON.stringify(rules),
    'Access-Control-Expose-Headers': userRuleHeaderName,
  })

  return next()
}

const filterIP = async (req, res, next) => {
  try {
    const {headers, socket} = req;
    let userIP = null

    //get IP address
    if (req.ip) userIP = req.ip
    if (headers['x-forwarded-for'] && !userIP) userIP = headers['x-forwarded-for']
    if (socket?.localAddress && !userIP) userIP = socket.localAddress

    console.log(userIP, 'userIP -1');

    if (typeof userIP === "string") {
      userIP = convert.ip2long(userIP)
    }
    if (!userIP) return next();
    console.log(userIP, 'userIP -2');
    const rule = await db.ipv4_blocking_rules.findOne({
      where: {
        begin: {[Op.lte]: userIP},
        end: {[Op.gte]: userIP},
      },
      raw: true
    })

    if (rule) {
      return next(new ErrorHandler(UNAUTHORIZED, 'You are banned'))
    }


    return next();
  } catch (e) {
    next(e)
  }
}
export {
  isAuth,
  permit,
  filterIP,
  checkIdInDb,
  validateBody,
  filterRules,
  checkUid,
  checkModel,
  handleRules,
}
