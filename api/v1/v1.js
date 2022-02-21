import app from 'express'

import AdminRouter from './admin'
import UserRouter from './user'

const router = app.Router()

router.use('/user', UserRouter)
router.use('/admin', AdminRouter)

export default router
