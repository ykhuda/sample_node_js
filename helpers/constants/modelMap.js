/**
 * The map is created to match database tables with routers
 * and is used in checkIdInDb method in ./helpers/utils/model.utils.js
 */
export default {
  addresses: 'address',
  orders: 'order',
  categories: 'category',
  client_groups: 'user_groups',
  countries: 'country',
  clients: 'user',
  client_mails: 'user_mail',
  credit_cards: 'credit_card',
  credit_cards2: 'user_credits2',
  inserts: 'inserts',
  denominations: 'denomination',
  holidays: 'holidays',
  tax_codes: 'tax_codes',
  discount_codes: 'discount_code',
  discount_rules: 'discount_rule',
  template_categories: 'template_category',
  share_options: 'share_option',
  coupons: 'coupons',
  twilio_requests: 'twilio_requests',
  gift_cards: 'gcard',
  fonts: 'fonts',
  signatures: 'signatures',
  subscriptions: 'subscriptions',
  social_sharings: 'social_sharings',
  notifications: 'notifications',
  templates: 'template',
  employees: 'employee',
  cards: 'card',
  card_images: 'card_image',
  batch_orders: 'order',
  manifests: 'manifests',
  generatePdf: 'card',
  // activities
  client: 'client_activity',
  employee: 'employee_activity',
  profile: 'employee',
  order_qa: 'order_qa',
  // reset
  user: 'user',
  admin: 'employee',
  rates: 'shipping_rates',
  methods: 'shipping_methods',
}
