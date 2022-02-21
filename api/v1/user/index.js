import app from 'express'

import {
  UserAuthRouter,
  BulkOrdersRouter,
  ProfileRouter,
  CardRouter,
  InsertRouter,
  CheckAuthRouter,
  DesignRouter,
  CategoriesRouter,
  GiftCardsRouter,
  ShippingRouter,
  NotificationsRouter,
  TemplateRouter,
  ConfigRouter,
  CouponRouter,
  OrderRouter,
  BasketRouter,
  CreditCardsRouter,
  DefaultRouter,
  TemplateCategoryRouter,
  FontRouter,
  SubscriptionRouter,
  CountryRouter,
} from './routers'

import {initialPassport} from '../../../configs/passport.config.js'

const router = app.Router()

const sessionLifetime = 1000 * 60 * 60 * 24
initialPassport(router, 'client', sessionLifetime)
// Auth & SignIn/Up/Out etc.
router.use('/auth', UserAuthRouter) //swagger +
// router.use(isAuth)

router.use('/basket', BasketRouter) //swagger 2 of any
router.use('/bulkOrders', BulkOrdersRouter) //swagger +
router.use('/cards', CardRouter) //swagger
router.use('/categories', CategoriesRouter) //swagger +
router.use('/countries', CountryRouter) //swagger +
router.use('/creditCards', CreditCardsRouter) //swagger +
router.use('/config', ConfigRouter) //swagger +
router.use('/coupon', CouponRouter) //swagger +
router.use('/checkauth', CheckAuthRouter) //swagger +
router.use('/default', DefaultRouter) //swagger 3 of any
router.use('/design', DesignRouter) //swagger +
router.use('/fonts', FontRouter) //swagger +
router.use('/giftCards', GiftCardsRouter) //swagger in progress
router.use('/inserts', InsertRouter) //swagger +
router.use('/notifications', NotificationsRouter) //swagger +
router.use('/orders', OrderRouter)
router.use('/profile', ProfileRouter) //swagger 7 of 15
router.use('/shipping', ShippingRouter)
router.use('/subscriptions', SubscriptionRouter) //swagger +
router.use('/templates', TemplateRouter) //swagger+
router.use('/templateCategories', TemplateCategoryRouter) //swagger +

export default router
