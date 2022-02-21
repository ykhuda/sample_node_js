import app from 'express';

import platform from '../../../../middlewares/platform.js';
import {categoriesController} from '../controllers/Categories.js';

const router = app.Router();

router.get('/list', platform, categoriesController.list);

export const CategoriesRouter = router
