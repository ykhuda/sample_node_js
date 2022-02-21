import app from 'express'

import OrderRouter from './routers/orders.js'
import BatchOrdersRouter from './routers/batch-orders.js'
import CategoryRouter from './routers/categories.js'
import ClientRouter from './routers/clients.js'
import ClientGroupRouter from './routers/client_groups.js'
import ClientMailRouter from './routers/client_mails.js'
import CreditCardRouter from './routers/credit_cards.js'
import CreditCard2Router from './routers/credit_cards_2.js'
import InsertRouter from './routers/inserts.js'
import CountryRouter from './routers/countries.js'
import DenominationRouter from './routers/denominations.js'
import HolidayRouter from './routers/holidays.js'
import TaxCodeRouter from './routers/tax_codes.js'
import DiscountCodeRouter from './routers/discount_codes.js'
import DiscountRuleRouter from './routers/discount_rules.js'
import SignatureRouter from './routers/signatures.js'
import SubscribtionRouter from './routers/subscriptions.js'
import ActivityRouter from './routers/activities.js'
import AddressRouter from './routers/addresses.js'
import GCardRouter from './routers/gift_cards.js'
import FontRouter from './routers/fonts.js'
import TemplateCategoryRouter from './routers/template_categories.js'
import ShareOptionRouter from './routers/share_options.js'
import CouponRouter from './routers/coupons.js'
import TwilioRequestRouter from './routers/twilio_requests.js'
import SocialSharingRouter from './routers/social_sharings.js'
import NotificationRouter from './routers/notifications.js'
import TemplateRouter from './routers/templates.js'
import EmployeeRouter from './routers/employees.js'
import CardRouter from './routers/cards.js'
import CardImageRouter from './routers/card_images.js'
import ResetRouter from './routers/reset.js'
import ProfileRouter from './routers/profile.js'
import QARouter from './routers/qa.js'
import ipv4Rules from './routers/ipv4Rules.js'
import AdminAuthRouter from './routers/auth'
import {checkIdInDb, handleRules, isAuth} from '../../../middlewares/access.js'
import OrderQaRouter from './routers/order_qa.js'
import Shipping from './routers/shipping.js'
import {initialPassport} from '../../../configs/passport.config.js'

const router = app.Router()
const sessionLifetime = 1000 * 60 * 60 * 24

initialPassport(router, 'user', sessionLifetime)

// Auth & SignIn/Up/Out etc.
router.use(handleRules)
router.use('/auth', AdminAuthRouter) // + swagger
router.use(isAuth)

router.get('/*', checkIdInDb)
router.put('/*', checkIdInDb)
router.delete('/*', checkIdInDb)

router.use('/addresses', AddressRouter) // swagger +
router.use('/batch_orders', BatchOrdersRouter) // + swagger
router.use('/orders', OrderRouter)
router.use('/categories', CategoryRouter)
router.use('/client_groups', ClientGroupRouter) // swagger +
router.use('/countries', CountryRouter) // swagger +
router.use('/clients', ClientRouter)
router.use('/client_mails', ClientMailRouter) // swagger +
router.use('/credit_cards', CreditCardRouter)
router.use('/credit_cards2', CreditCard2Router)
router.use('/inserts', InsertRouter)
router.use('/denominations', DenominationRouter) // swagger +
router.use('/holidays', HolidayRouter) // swagger +
router.use('/tax_codes', TaxCodeRouter) // swagger +
router.use('/discount_codes', DiscountCodeRouter) // swagger +
router.use('/discount_rules', DiscountRuleRouter) // swagger +
router.use('/activities', ActivityRouter)
router.use('/template_categories', TemplateCategoryRouter)
router.use('/share_options', ShareOptionRouter) // swagger +
router.use('/shipping', Shipping)
router.use('/coupons', CouponRouter) // swagger +
router.use('/twilio_requests', TwilioRequestRouter) // + swagger
router.use('/gift_cards', GCardRouter) // + swagger
router.use('/fonts', FontRouter) // + swagger
router.use('/signatures', SignatureRouter)
router.use('/subscriptions', SubscribtionRouter) // + swagger
router.use('/social_sharings', SocialSharingRouter) // + swagger
router.use('/notifications', NotificationRouter) // + swagger
router.use('/templates', TemplateRouter) // + swagger
router.use('/employees', EmployeeRouter)
router.use('/cards', CardRouter)
router.use('/ipv4Rules', ipv4Rules)
router.use('/card_images', CardImageRouter)
router.use('/reset', ResetRouter) // - swagger
router.use('/profile', ProfileRouter) // + swagger
router.use('/qa', QARouter) // + swagger
router.use('/order_qa', OrderQaRouter) // + swagger

export default router
