import app from 'express'

import {templateController} from '../controllers/TemplateCategories.js'

const router = app.Router()

router.get('/list', templateController.list)

export const TemplateCategoryRouter = router
