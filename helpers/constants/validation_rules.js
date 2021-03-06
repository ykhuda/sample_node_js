/**
 * The map is created to validate user's input on PUT/POST
 * and is used in validateBody method in ./helpers/utils/model.utils.js
 */
const commonProps = {
  id: 'number',
}

export default {
  category: {
    ...commonProps,
    checked: 'number',
    is_custom: 'number',
    icon: 'string',
    slug: 'string',
    meta_title: 'string',
    meta_description: 'string',
    // file: "string",

    // not null
    taxonomy: 'string',
    name: ['string', 'number'],
    // sort: "number",
  },
  cards: {
    ...commonProps,
    user_id: 'number',
    available_free: 'number',
    status: 'number',
    quantity: 'number',
    category_id: 'number',
    cover: 'string',
    cover_lowres: 'string',
    cover_width: 'number',
    cover_height: 'number',
    price: ['string', 'number'],
    description: ['string', 'number'],
    width: 'number',
    height: 'number',
    sort_no: 'number',
    date_created: 'string',
    orientation: 'string',
    sku: 'string',
    closed_height: 'number',
    closed_width: 'number',
    open_height: 'number',
    ope_width: 'number',
    margin_top: 'number',
    margin_right: 'number',
    margin_bottom: 'number',
    margin_left: 'number',
    envelope_height: 'number',
    envelope_width: 'number',
    font_size: 'number',
    envelope_font_size: 'number',
    envelope_lines_between_addresses: 'number',
    envelope_to_tabs: 'number',
    envelope_margin_top: 'number',
    envelope_margin_right: 'number',
    envelope_margin_bottom: 'number',
    envelope_margin_left: 'number',
    half_inside: 'string',
    home_card: 'number',
    preview_margin_left: 'number',
    preview_margin_top: 'number',
    preview_margin_right: 'number',
    preview_margin_bottom: 'number',
    details_envelope: 'string',
    details_author: 'string',
    cover_restricted: 'number',
    low_stock_threshold: 'number',
    client_notification_emails: 'string',
    low_stock_notifications_sent: 'number',
    tax_exempt: 'number',
    notes: 'string',
    supress_return_address: 'number',

    // not null
    name: ['string', 'number'],
  },
  card_image: {
    ...commonProps,
    image: 'string',
    image_lowres: 'string',
    image_width: ['string', 'number'],
    image_height: ['string', 'number'],
    preview: 'string',
    type: 'string',
    sort_no: 'number',

    // not null
    card_id: 'number',
  },
  address: {
    type: 'string',
    user_id: 'number',
    order_id: 'number',
    date_updated: 'string',
    basket_id: 'number',
    country: 'string',
    country_id: 'number',
    birthday: 'string',
    address_id: 'number',
    ext_id: 'number',

    // not null
    ...commonProps,
    name: 'string',
    business_name: 'string',
    address1: 'string',
    address2: 'string',
    city: 'string',
    state: 'string',
    zip: ['string', 'number'],
    date_created: 'string',
    delivery_cost: ['string', 'number'],
    first_name: 'string',
    last_name: 'string',
  },
  user_groups: {
    ...commonProps,
    limit_categories: 'number',
    title: ['number', 'string'],
  },
  country: {
    ...commonProps,
    aliases: ['string', 'number'],

    // not null
    name: 'string',
  },
  coupons: {
    ...commonProps,
    expiration_date: 'string',

    // not null
    code: 'string',
    credit: ['string', 'number'],
    used: 'number',
  },
  credit_cards2: {
    // not null
    user_id: 'number',
    amount: 'number',
    expires_at: 'string',
  },
  denomination: {
    ...commonProps,
    active: 'number',

    // not null
    gcard_id: 'number',
    nominal: ['string', 'number'],
    price: ['string', 'number'],
  },
  discount_code: {
    ...commonProps,
    credit: ['string', 'number'],
    count: ['string', 'number'],
    group_id: 'number',
    type: 'string',
    users_limit: ['string', 'number'],
    invoiced: 'number',

    // not null
    domain_regex: 'string',
    code: 'string',
  },
  discount_rule: {
    ...commonProps,
    user_group_id: 'number',
    discount: 'number',

    // not null
    min_number: ['string', 'number'],
  },
  employee: {
    ...commonProps,
    username: ['string', 'number'],
    password: ['string', 'number'],
    email: 'string',
    activkey: 'string',
    superuser: 'number',
    status: 'number',
    create_at: 'string',
    lastvisit_at: 'string',
    can_view_users: 'number',
    can_edit_users: 'number',
    can_edit_cards: 'number',
    can_edit_templates: 'number',
    can_edit_posts: 'number',
    can_edit_feedbacks: 'number',
    can_edit_orders: 'number',
    can_edit_gift_cards: 'number',
    token: 'string',
    notify_on_low_stock: 'number',
    can_edit_fonts: 'number',
    can_edit_coupons: 'number',
    can_edit_discount_codes: 'number',
    can_edit_discount_rules: 'number',
    can_edit_holidays: 'number',
    can_create_ups_shipping_labels: 'number',
    can_edit_notifications: 'number',
    api_token: 'string',
    can_edit_subscriptions: 'number',
  },
  fonts: {
    id: 'string',
    font_eot_file: 'object',
    font_name: 'string',
    visible: 'number',
    line_spacing: ['string', 'number'],
    // not null
    font_id: 'number',
    label: 'string',
    font_file: 'object',
    image: 'object',
    sort: 'number',
    on_custom: 'number',
  },
  gcard: {
    // not null
    ...commonProps,
    name: ['number', 'string'],
    image: 'string',
  },
  holidays: {
    ...commonProps,
    date: 'string',
  },
  inserts: {
    ...commonProps,
    user_id: 'number',
    name: ['string', 'number'],
    price: ['string', 'number'],
    group_id: 'number',
  },
  share_option: {
    ...commonProps,
    text: 'string',
    link: 'string',
    link_android: 'string',
    // not null
    name: 'string',
  },
  social_sharing: {
    ...commonProps,
    user_id: '',
    network: '',
    created_at: '',
    request_ip: '',
  },
  subscriptions: {
    ...commonProps,
    status: 'string',
    sort: 'number',
    name: 'string',
    period: 'number',
    employee_id: 'number',
    created_at: 'string',
    updated_at: 'string',
    is_best_value: 'number',
    description: 'string',
    plan_icon: 'string',
    color: 'string',
    cost_description: ['string', 'number'],
    taxable_amount: ['string', 'number'],
    tax_exempt: 'number',
    // not null
    fee: ['string', 'number'],
    credit2: ['string', 'number'],
    discount: ['string', 'number'],
  },
  tax_codes: {
    ...commonProps,
    // not null
    name: 'string',
    tax_code: 'string',
  },
  template_category: {
    ...commonProps,
    // not null
    name: 'string',
  },
  template: {
    ...commonProps,
    user_id: 'number',
    category_id: 'number',
    status: 'number',
    wishes: 'string',
    signature_id: 'number',
    signature2_id: 'number',
    // not null
    name: 'string',
    message: 'string',
  },
  twilio_requests: {
    ...commonProps,
    phone: 'string',
    request: 'string',
    created_at: 'string',
    request_ip: 'string',
    carrier_name: 'string',
  },
  signatures: {
    ...commonProps,
    user_id: 'number',
    name: ['string', 'number'],
    code: 'string',
  },
  shipping_rate: {
    ...commonProps,
    name: 'string',
    base: 'number',
    per_card_fee: 'number',
    minimum_fee: 'number',
    sort_order: 'number',
    status: 'number',
  },
  shipping_method: {
    ...commonProps,
    method_name: 'string',
    method_label: 'string',
    discount: 'number',
    add_postage_fee: 'number',
    check_return_address: 'number',
    check_recipient_address: 'number',
    show_options: 'number',
    status: 'number',
  }
}
