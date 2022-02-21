import {templateService} from '../services'

const list = async (req, res, next) => {
  try {
    const categories = await templateService.getTemplateCategories()

    res.status(200).json({
      httpCode: 200,
      status: 'ok',
      categories,
    })
  } catch (e) {
    next(e)
  }
}

export const templateController = {
  list
}
