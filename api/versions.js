import app from 'express'

import v1 from './v1/v1.js'
import {filterIP} from "../middlewares/access.js";

const router = app.Router()

router.use('*', filterIP)

router.use('/v1', v1)
// import v2 from './v2/index.js'; for the future purposes
// router.use('/v2', v2);

export default router
