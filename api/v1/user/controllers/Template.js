import sequelize from 'sequelize'

import constants from '../../../../helpers/constants/constants.js'
import {ErrorHandler} from '../../../../middlewares/error.js'
import {
  deleteEntity,
  findEntity,
  simpleCreateEntity,
  simpleUpdateEntity,
} from '../../../../helpers/utils/model.utils.js'
import {getUrl} from '../../../../helpers/utils/media/getUrl.js'
import db from '../../../../db/models'

const {INVALID_DATA, OK} = constants
const {Op} = sequelize

const create = async (req, res, next) => {
  try {
    const {body: {name, message, wishes = null, signature_id = null, signature2_id = null}, user: {id: userId}} = req;

    if (!name) throw new ErrorHandler(INVALID_DATA, 'name error')

    if (!message) throw new ErrorHandler(INVALID_DATA, 'message error')

    if (signature_id && signature2_id) throw new ErrorHandler(INVALID_DATA, 'There can be only one value for a signature')

    let signature = null;
    let signature2 = null;

    if (signature_id) {
      signature = await findEntity('signatures', null, {id: signature_id, user_id: userId}, null, {raw: true}, null)
    }
    if (signature2_id) {
      signature2 = await findEntity('signatures', null, {id: signature2_id, user_id: userId}, null, {raw: true}, null)

    }

    if ((signature_id && !signature) || (signature2_id && !signature2)) throw new ErrorHandler(INVALID_DATA, `Invalid data in the signature${signature2 ? '2' : ''}_id field`)

    const template = await db.template.findOne({where: {status: 0, user_id: userId, name: name}, raw: true})

    if (template) throw new ErrorHandler(INVALID_DATA, 'template name already exists')

    const {dataValues} = await simpleCreateEntity('template', {
      user_id: userId,
      name,
      message,
      wishes,
      signature_id,
      signature2_id,
      category_id: null,
      status: 0,
    })

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      template: {
        ...dataValues,
        ...(signature_id ? {
          signature: {
            ...signature.dataValues,
            preview: getUrl(signature.dataValues.preview, 'signatures'),
          },
        } : null),
        ...(signature2_id ? {
          signature2: {
            ...signature2.dataValues,
            preview: getUrl(signature2.dataValues.preview, 'signatures'),
          },
        } : null),
      },
      template_id: dataValues.id,
    })
  } catch (e) {
    next(e)
  }
}

const update = async (req, res, next) => {
  try {
    const {body: {template_id, name, message, wishes = null, signature_id, signature2_id}, user: {id: userId}} = req;

    if (!template_id) throw new ErrorHandler(INVALID_DATA, 'template id error')

    const template = await findEntity('template', null, {id: template_id, status: 0})

    if (!template) throw new ErrorHandler(INVALID_DATA, 'no such template')

    if (template.user_id !== userId) throw new ErrorHandler(INVALID_DATA, 'access denied')

    if (signature_id && signature2_id && +signature_id !== 0 && +signature2_id !== 0) {
      throw new ErrorHandler(INVALID_DATA, 'There can be only one value for a signature')
    }

    if ((!name || name === template.name)
      && (message === template.message)
      && (wishes === template.wishes)
      && (signature_id === template.signature_id)
      && (signature2_id === template.signature2_id)) {
      throw new ErrorHandler(INVALID_DATA, 'nothing to update')
    }

    const templateExist = await findEntity('template', null, {
      status: 0,
      user_id: userId,
      name: name,
    }, null, {raw: true})

    if (templateExist && templateExist.id !== template_id) {
      throw new ErrorHandler(INVALID_DATA, 'template name already exists')
    }
    const [signature, signature2] = await Promise.all([
      (signature_id ? findEntity('signatures', null, {id: signature_id, user_id: userId}) : null),
      (signature2_id ? findEntity('signatures', null, {id: signature2_id, user_id: userId}) : null),

    ])
    if ((signature_id && !signature) || (signature2_id && !signature2)) throw new ErrorHandler(INVALID_DATA, `Invalid data in the signature${signature2 ? '2' : ''}_id field`)

    await simpleUpdateEntity('template', {id: template_id, status: 0}, {
      name,
      message,
      wishes,
      ...(signature_id ? {signature_id, signature2_id: null} : {signature_id: null}),
      ...(signature2_id ? {signature2_id, signature_id: null} : {signature2_id: null}),
    })

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      template: await findEntity('template', null, {id: template_id, status: 0})
    })
  } catch (e) {
    next(e)
  }
}

const deleteTemplates = async (req, res, next) => {
  try {
    const {body: {template_id}, user: {id: userId}} = req;

    if (!template_id) throw new ErrorHandler(INVALID_DATA, 'template id error')

    await deleteEntity('template', {id: template_id, status: 0, user_id: userId});

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
}

const list = async (req, res, next) => {
  try {
    let {user, query: {category_id: categoryId}, params} = req;

    const verizonCatId = params['template.verizonCategoryId']

    if (categoryId === 'verizon') {
      categoryId = verizonCatId
    }
    if (categoryId) {
      if (typeof +categoryId !== 'number') {
        throw new ErrorHandler(INVALID_DATA, 'category id error')
      }
      categoryId = +categoryId
    }
    const templates = await db.template.findAll({
      where:
        {
          status: 0,
          ...(categoryId !== verizonCatId ? {[Op.or]: [{category_id: null}, {category_id: {[Op.not]: verizonCatId}}]} : {}),
          //-
          ...(categoryId !== null ?
            {...(categoryId !== 0 ? {category_id: categoryId} : {user_id: user.id, category_id: null})} : {
              [Op.or]: [
                {user_id: user.id, category_id: null},
                {user_id: null, category_id: {[Op.not]: null}},
              ],
            }),
          // -
        },
      order: [['category_id', 'ASC'], ['id', 'DESC']],
      group: ['id'],
      include: [
        {
          model: db.signatures,
          as: 'signature',
        },
        {
          model: db.signatures,
          as: 'signature2',
        },
      ],
    })

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      templates: templates.map(({id, category_id, name, message, wishes, signature, signature2}) => {

        return {
          id,
          category_id,
          name,
          message,
          wishes,
          signature: {
            ...(signature ? {
              id: signature.id,
              name: signature.name,
              code: signature.code,
              preview: getUrl(signature?.preview, process.env.AWS_FOLDER_SIGNATURE),
            } : null),
          },
          signature2: {
            ...(signature2 ? {
              id: signature2.id,
              name: signature2.name,
              code: signature2.code,
              preview: getUrl(signature2?.preview, process.env.AWS_FOLDER_SIGNATURE),
            } : null),
          },
        }
      })
    })
  } catch (e) {
    next(e)
  }
}

const view = async (req, res, next) => {
  try {
    const {user, query: {template_id}} = req

    if (!template_id) throw new ErrorHandler(INVALID_DATA, 'template id error')

    const template = await db.template.findOne({
      where: {
        status: 0,
        id: template_id,
      },
      include: [
        {
          model: db.signatures,
          as: 'signature',
        },
        {
          model: db.signatures,
          as: 'signature2',
        },
      ],
    })

    if (template === null) {
      throw new ErrorHandler(INVALID_DATA, 'no such template')
    }

    if (template.category_id === 0 && template.user_id !== user.id) {
      throw new ErrorHandler(INVALID_DATA, 'access denied')
    }

    const {id, category_id, name, message, wishes, signature, signature2} = template;

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      template: {
        id,
        category_id,
        name,
        message,
        wishes,
        signature: {
          ...(signature ? {
            id: signature.id,
            name: signature.name,
            code: signature.code,
            preview: getUrl(signature?.preview),
          } : null),
        },
        signature2: {
          ...(signature2 ? {
            id: signature2.id,
            name: signature2.name,
            code: signature2.code,
            preview: getUrl(signature2?.preview),
          } : null),
        },
      }
    })
  } catch (e) {
    next(e)
  }
}


export const templateController = {
  deleteTemplates,
  create,
  update,
  view,
  list
}
