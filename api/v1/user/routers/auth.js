import app from 'express'

const router = app.Router()

import {authController, authAccount, authSocial, resetPassword} from '../controllers/auth'
import constants from '../../../../helpers/constants/constants.js'
import platformMw from '../../../../middlewares/platform.js'
import {checkUid} from '../../../../middlewares/access.js'

const {UNAUTHORIZED} = constants

// ### GET
router.get('/checkLogin', authAccount.checkLogin)

router.get('/getUser', authAccount.getUser)

router.get('/resetPasswordConfirm/:hash', resetPassword.getHash)

// ### POST
router.post('/activation/:hash', authAccount.activation)

router.post('/logout', authController.logout)

router.post('/token/:token', authController.login)

router.post('/setTestMode', checkUid([UNAUTHORIZED, 'no auth']), authAccount.setTestMode)

router.post('/registration', platformMw, authController.registration)

router.post('/authorization', authController.login)

router.post('/resetPasswordRequest', resetPassword.resetRequest)

router.post('/resetPasswordConfirm/:hash', resetPassword.confirmHash)

router.post('/setPassword', checkUid([UNAUTHORIZED, 'no auth']), authAccount.setPassword)

router.post('/convertAccount', checkUid([UNAUTHORIZED, 'no auth']), authAccount.convertAccount)

router.get('/google', platformMw, authSocial.google)

router.get('/facebook', platformMw, authSocial.facebook)

router.get('/apple', platformMw, authSocial.apple)

router.post('/socialNetworkRegistration', platformMw, authSocial.networkRegistration)

router.post('/integrations', platformMw, authController.integrations)

export const UserAuthRouter = router;
