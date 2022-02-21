import lodash from "lodash";

import {
  addressesService,
  fontService,
  insertService,
  creditCardService,
  profileService
} from '../api/v1/user/services';
import {convert} from '../helpers/utils/convert'
import constants from "../helpers/constants/constants.js";
import {ErrorHandler} from "./error.js";
import db from "../db/models";
import {authenticate, getDataByUid} from "../api/v1/user/controllers/Users.js";
import {simpleCreateEntity, transaction} from "../helpers/utils/model.utils.js";
import {checkAddress} from "../api/v1/user/controllers/Profile.js";
import {errorBuilder} from '../helpers/utils'
import attributes from "../helpers/utils/attributes.js";

const {INVALID_DATA, UNAUTHORIZED, ADDRESS_DEFAULT_VALUE, OK} = constants
const {OFF_MODE_STATUS, OFF_MODE_MESSAGE} = process.env
const {ACardView, IsCustom} = attributes;

const createSendDateForPay = async (req, res, next) => {
  try {
    const {
      user, body: {
        date_send,
        now_date,
        order_id,
        credit_card_id,
      }
    } = req

    if (parseInt(OFF_MODE_STATUS) && !user.off_mode_override) {
      throw new ErrorHandler(422, OFF_MODE_MESSAGE)
    }

    if (!order_id || typeof +order_id !== "number") {
      throw new ErrorHandler(INVALID_DATA, 'order id error')
    }

    let sendDate = false
    if (date_send) {
      sendDate = {
        year: new Date(date_send).getFullYear(),
        month: new Date(date_send).getMonth(),
        day: new Date(date_send).getDate(),
      }
    }

    if (!sendDate || (isNaN(sendDate.day) && isNaN(sendDate.month) && isNaN(sendDate.year))) {
      sendDate = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        day: new Date().getDate(),
      }
    }

    let nowDate = false

    if (now_date) {
      nowDate = {
        year: new Date(now_date).getFullYear(),
        month: new Date(now_date).getMonth(),
        day: new Date(now_date).getDate(),
      }
    }
    if (!nowDate || (isNaN(now_date.day) && isNaN(now_date.month) && isNaN(now_date.year))) {
      nowDate = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        day: new Date().getDate(),
      }
    }

    let pm = null
    if (credit_card_id) {
      pm = await creditCardService.findCreditCard(credit_card_id, user.id)
    }

    req.pm = pm;
    req.nowDate = nowDate;
    req.sendDate = sendDate;
    req.datePayed = new Date()
    next()
  } catch (e) {
    next(e)
  }
}

const addressValid = async (req, res, next) => {
  try {
    const {user, body} = req;
    const {locals: {platform}} = res;

    let {
      address_id = '',
      message = '',
      address_ids,
      addresses = null,
      signature_id,
      signature2_id,
    } = body

    let mess;
    let intl = false;
    let addressTo = null;
    let is_bulk = false;

    /*singleOrder->*/
    if (address_id) {

      addressTo = await addressesService.getAddressByID(address_id, user.id);

      is_bulk = false;

      if (addressTo.country_id !== 1) {
        intl = true;
      }
    }

    if (!address_id && address_ids && address_ids[0] && address_ids.length === 1) {
      const [addressId] = address_ids;

      addressTo = await addressesService.getAddressByID(addressId, user.id);

      is_bulk = false;

      if (addressTo.country_id !== 1) {
        intl = true;
      }
    }
    /*<-singleOrder*/

    /*multiAddress->*/
    let multiaddress = false;
    if (address_ids && !lodash.isEmpty(address_ids) && address_ids?.length > 1) {
      is_bulk = true;
      multiaddress = true;

      let foundAddress = await addressesService.getAddressesByIds(user.id, address_ids);

      addresses = foundAddress.map(address => {
        if (address?.country_id && address.country_id !== 1) {
          intl = true;
        }
        return {
          id: address.id,
          ext_id: address.ext_id,
          to_name: address.name,
          to_first_name: address.first_name,
          to_last_name: address.last_name,
          to_business_name: address.business_name,
          to_address1: address.address1,
          to_address2: address.address2,
          to_city: address.city,
          to_state: address.state,
          to_zip: address.zip,
          to_country_id: address.country_id,
          to_birthday: address.birthday,
          address_id: address.id,
          message: convert.replaceMess(address.first_name, address.last_name, address.business_name, message),
        }
      })

    } else if (addresses) {
      is_bulk = true;
    }
    /*<-multiAddress*/


    /*signatures*/
    if (signature_id) {
      req.signature = await db.signatures.findOne({where: {id: signature_id, user_id: user.id}});
    }

    if (signature2_id) {
      req.signature2 = await db.signatures.findOne({where: {id: signature2_id, user_id: user.id}});
    }
    /*signatures*/


    // replace string
    if (addressTo) {
      const {first_name, last_name, business_name} = addressTo;
      mess = convert.replaceMess(first_name, last_name, business_name, message);
    }

    if (!address_id && lodash.isEmpty(addresses) && lodash.isEmpty(address_ids)) {
      throw new ErrorHandler(INVALID_DATA, 'addresses not set')
    }

    req.intl = intl;
    req.is_bulk = is_bulk;
    req.platform = platform;
    req.addresses = addresses;
    req.addressTo = addressTo;
    req.multiaddress = multiaddress;
    req.recipientMessage = mess ? mess : null;
    next()
  } catch (e) {
    next(e)
  }
}

const placeBasketBodyValid = async (req, res, next) => {
  try {
    let {
      body: {card_id, date_send, message, font, denomination_id, insert_id},
      intl,
      addresses = null,
      user,
      is_bulk
    } = req

    if (!card_id || typeof +card_id !== 'number') {
      throw new ErrorHandler(INVALID_DATA, 'card id error')
    }

    if (!is_bulk) {
      if (!message) throw new ErrorHandler(INVALID_DATA, 'message error')
    } else {
      req.quantity = addresses.length
    }

    if (denomination_id && intl) {
      throw new ErrorHandler(INVALID_DATA, 'gift card is not allowed')
    }


    let denomination = null
    if (denomination_id) {
      denomination = await db.denomination.findByPk(denomination_id, {raw: true})

      if (!intl && !denomination) {
        throw new ErrorHandler(INVALID_DATA, 'no such gift card')
      }
    }

    const [card, fontModel] = await Promise.all([
      db.card.findByPk(card_id, {
        raw: true, attributes: [...ACardView, IsCustom],
        include: {
          model: db.category,
          attributes: ['name', 'id', 'taxonomy'],
        }
      }),
      fontService.getFont(font),
    ])

    if (!fontModel) throw new ErrorHandler(INVALID_DATA, 'font not found')

    if (!card) throw new ErrorHandler(INVALID_DATA, 'card not found')

    // insert
    if (insert_id) {
      req.insert = await insertService.getUserInsert(insert_id, user)
    }

    req.card = card;
    req.fontModel = fontModel;
    req.denomination = denomination;
    req.sendDate = new Date(date_send);
    next()
  } catch (e) {
    next(e)
  }
}

const checkValidBodyForSend = async (req, res, next) => {
  try {
    const {body: {check_quantity, test_mode, credit_card_id, data_value}, user} = req


    if (parseInt(OFF_MODE_STATUS) && !user.off_mode_override) {
      throw new ErrorHandler(INVALID_DATA, OFF_MODE_MESSAGE)
    }

    //check test mode
    if (test_mode && !!test_mode !== !!user.test_mode) throw new ErrorHandler(INVALID_DATA, 'test mode error')

    if (!data_value && (!credit_card_id || typeof credit_card_id !== "number") && !user.invoiced) {
      throw new ErrorHandler(INVALID_DATA, 'credit_card id error')
    }

    let pm = null
    if (credit_card_id) {
      pm = await creditCardService.findCreditCard(credit_card_id, user.id)
    }

    req.pm = pm;
    req.check_quantity = !!check_quantity;
    req.credit = user.credit;
    req.invoiced = user.invoiced;
    req.tax_exempt = user.tax_exempt;
    req.test_mode = user.test_mode;
    next()
  } catch (e) {
    next(e)
  }
}

const singleStepCheckValidData = (req, res, next) => transaction(async t => {
  let ApiLog = ''
  try {
    const {query, body: {login, password}, body, headers: {authorization}} = req;
    const {} = req
    let apiLogMessage = '';

    if (query) {
      apiLogMessage = apiLogMessage.concat(`QUERY:${JSON.stringify(query)}\n`)
    }

    if (body) {
      apiLogMessage = apiLogMessage.concat(`BODY:${JSON.stringify(body)}\n`)
    }

    ApiLog = {
      event: 'SingleStepOrder',
      message: apiLogMessage,
      user_id: null,
      level: 'DEBUG',
      entity: null,
      entity_id: null,
    }

    let user = await getDataByUid(authorization);

    if (!user) {
      if (!login || !password) {
        throw new ErrorHandler(UNAUTHORIZED, 'no auth', ApiLog)
      }
      const auth = await authenticate({username: login, password});

      if (!auth.status) {
        throw new ErrorHandler(UNAUTHORIZED, auth.errorMessage, ApiLog)
      }
      user = auth.user
    }
    ApiLog.user_id = user.id;

    if (parseInt(OFF_MODE_STATUS) && !user.off_mode_override) {
      throw new ErrorHandler(INVALID_DATA, OFF_MODE_MESSAGE, ApiLog)
    }

    //todo decode req?
    const {
      card_id,
      denomination_id,
      insert_id,
      message,
      font_label = 'Casual',
      couponCode,
      credit_card_id,
      date_send = new Date(),
      validate_address,
      webhook_url = null,
    } = req.body;
    const promises = []

    const validFlag = validate_address && validate_address !== 'false'

    if (!card_id || typeof +card_id !== 'number') {
      throw new ErrorHandler(INVALID_DATA, 'card id error', ApiLog)
    }

    const [font, card] = await Promise.all([
      db.fonts.findOne({where: {label: font_label}, raw: true}),
      db.card.findByPk(card_id, {include: {model: db.category}}),
    ])

    if (!font) {
      throw new ErrorHandler(INVALID_DATA, 'font label error', ApiLog)
    }

    if (!card || card.quantity <= 0) {
      throw new ErrorHandler(INVALID_DATA, 'Card not found', ApiLog)
    }

    const chars = card.width * card.height;

    if (message && message.length > chars) {
      throw new ErrorHandler(INVALID_DATA, 'You have a message that is too long for the card.  Either shorten your message or choose another card', ApiLog)
    }

    const userAddressFrom = await getSenderAddressData(body, ApiLog);

    if (validFlag) {
      promises.push(checkAddress(userAddressFrom))
    }

    const address_from = await addressesService.updateAddress(user, userAddressFrom, t)

    if (!address_from) {
      throw new ErrorHandler(INVALID_DATA, 'Error saving sender address.', ApiLog)
    }

    // use return address as billing info if billing info is not present
    if (!user?.billing_country_id || user?.billing_zip) {
      promises.push(
        profileService.setBillingInfo(user.id,
          userAddressFrom.address1,
          userAddressFrom.country_id,
          userAddressFrom.zip,
          t)
      )
    }
    userAddressFrom.user_id = user.id;

    // add the recipient's address
    let userAddressTo = await getRecipientAddress(body, ApiLog)

    if (validFlag) {
      promises.push(checkAddress(userAddressTo))
    }

    let address_to = await db.address.findOne({
      where: {
        user_id: user.id,
        type: 'user_to',
        ...userAddressTo
      },
    })

    if (!address_to) {
      address_to = await simpleCreateEntity('address', {type: 'user_to', user_id: user.id, ...userAddressTo}, t)
      if (!address_to) {
        throw new ErrorHandler(INVALID_DATA, 'Error saving recipient address.', ApiLog)
      }
    }

    if (denomination_id && userAddressTo?.country_id && userAddressTo.country_id !== 1) {
      throw new ErrorHandler(INVALID_DATA, 'Gift cards are for US only recipients.', ApiLog)
    }

    let denomination;
    if (denomination_id) {
      denomination = await db.denomination.findByPk(denomination_id, {include: {model: db.gcard}})
      if (!denomination) {
        throw new ErrorHandler(INVALID_DATA, 'no such gift card', ApiLog)
      }
    }

    if (insert_id) {
      req.insert = await insertService.getUserInsert(insert_id, user)
    }

    await Promise.all(promises)

    req.denomination = denomination;
    req.font = font;
    req.card = card;
    req.invoiced = user.invoiced;
    req.tax_exempt = user.tax_exempt;
    req.test_mode = user.test_mode;
    req.date_payed = Date.now()
    req.address_from = address_from;
    req.address_to = address_to;
    req.user = user;
    req.ApiLog = ApiLog;
    req.sendDate = new Date(date_send);
    req.address_id = address_to.id;
    next()
  } catch (e) {
    if (e.object) {
      let message = e.object.message.concat(`ERROR:${JSON.stringify({httpCode: e.httpCode, message: e.message})}`)
      await simpleCreateEntity('api_log', {...e.object, message: message, level: 'ERROR'})
    }
    next(e)
  }
})

const getRecipientAddress = async (body, apiLog = null) => {
  let {
    recipient_name,
    recipient_first_name,
    recipient_last_name,
    recipient_business_name,
    recipient_address1,
    recipient_address2,
    recipient_city,
    recipient_state,
    recipient_zip,
    recipient_country_id,
    recipient_country,
  } = body;

  if (recipient_first_name && recipient_last_name) {
    recipient_name = `${recipient_first_name} ${recipient_last_name}`
  } else {
    if (!recipient_name) {
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check recipient name', apiLog);
    } else {
      recipient_first_name = recipient_name;
    }
  }

  if (!recipient_address1) {
    throw new ErrorHandler(INVALID_DATA, 'Oops! Please check recipient address', apiLog);
  }

  if (!recipient_city) {
    throw new ErrorHandler(INVALID_DATA, 'Oops! Please check recipient city', apiLog)
  }
  let country = null
  if (recipient_country_id) {
    country = await addressesService.getCountry(recipient_country_id);

    if (!country) {
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check recipient country id', apiLog)
    }
  } else if (recipient_country) {
    country = await db.country.findOne({where: {name: recipient_country}, raw: true});
    if (!country) {
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check recipient country', apiLog)
    }
  } else {
    country = await addressesService.getCountry(1);
    if (!country) {
      console.log('Country 1 not found', 'error')
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check recipient country id', apiLog)
    }
  }

  if ((country.id === 1 || country.id === 2) && !recipient_state) {
    throw new ErrorHandler(INVALID_DATA, 'Oops! Please check recipient state', apiLog)
  }

  return {
    name: recipient_name,
    first_name: recipient_first_name,
    last_name: recipient_last_name,
    business_name: recipient_business_name,
    address1: recipient_address1,
    address2: recipient_address2,
    city: recipient_city,
    state: recipient_state,
    zip: recipient_zip,
    country_id: country.id,
    country: country.name,
    delivery_cost: country.delivery_cost,
  }
}

const getSenderAddressData = async (body, apiLog = null) => {
  let {
    sender_name,
    sender_first_name,
    sender_last_name,
    sender_business_name,
    sender_address1,
    sender_address2,
    sender_city,
    sender_state,
    sender_zip,
    sender_country_id,
    sender_country,
  } = body;

  if (sender_first_name && sender_last_name) {
    sender_name = `${sender_first_name} ${sender_last_name}`
  } else {
    if (!sender_name) {
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check sender name', apiLog);
    } else {
      sender_first_name = sender_name;
    }
  }

  if (!sender_address1) {
    throw new ErrorHandler(INVALID_DATA, 'Oops! Please check sender address', apiLog);
  }

  if (!sender_city) {
    throw new ErrorHandler(INVALID_DATA, 'Oops! Please check sender city', apiLog)
  }
  let country = null
  if (sender_country_id) {
    country = await addressesService.getCountry(sender_country_id);

    if (!country) {
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check sender country id', apiLog)
    }
  } else if (sender_country) {
    country = await db.country.findOne({where: {name: sender_country}, raw: true});
    if (!country) {
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check sender country', apiLog)
    }
  } else {
    country = await addressesService.getCountry(1);
    if (!country) {
      console.log('Country 1 not found', 'error')
      throw new ErrorHandler(INVALID_DATA, 'Oops! Please check sender country id', apiLog)
    }
  }

  if ((country.id === 1 || country.id === 2) && !sender_state) {
    throw new ErrorHandler(INVALID_DATA, 'Oops! Please check sender state', apiLog)
  }

  return {
    name: sender_name,
    first_name: sender_first_name,
    last_name: sender_last_name,
    business_name: sender_business_name,
    address1: sender_address1,
    address2: sender_address2,
    city: sender_city,
    state: sender_state,
    zip: sender_zip,
    country_id: country.id,
    country: country.name,
    delivery_cost: country.delivery_cost,
  }
}

const check_shipping_method = async (req, res, next) => {
  try {
    const {
      body: {
        shipping_method_id = null,
        shipping_rate_id = null,
        shipping_address_id = null,
        must_deliver_by = null
      }
    } = req;

    let shipping_method = null;
    let shipping_rate = null;
    let shipping_address = null;

    if (shipping_method_id) {
      shipping_method = await db.shipping_methods.findOne({
        where: {id: shipping_method_id, status: 1},
        raw: true,
        nest: true
      });

      if (!shipping_method) {
        throw  new ErrorHandler(INVALID_DATA, 'Shipping method not found')
      }

    }
    if (shipping_rate_id) {
      shipping_rate = await db.shipping_rates.findOne({
        where: {id: shipping_rate_id},
        raw: true,
        nest: true
      })

      if (!shipping_rate) {
        throw new ErrorHandler(INVALID_DATA, 'Shipping rate not found!')
      }
    }

    if (shipping_address_id) {
      shipping_address = await db.address.findOne({
        where: {id: shipping_address_id},
        raw: true,
        nest: true
      })

      if (!shipping_address) {
        throw new ErrorHandler(INVALID_DATA, 'Shipping address not found!')
      }
    }

    if (shipping_rate && !must_deliver_by) {
      throw new ErrorHandler(INVALID_DATA, 'Must receive by is required!')
    }

    req.shipping_rate = shipping_rate;
    req.shipping_method = shipping_method;
    req.shipping_address = shipping_address;
    req.must_deliver_by = must_deliver_by;
    next()
  } catch (e) {
    next(e)
  }
}

const checkOrderConfig = async (req, res, next) => {
  try {
    const {body: {configs = []}, user} = req;

    if (lodash.isEmpty(configs)) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError())

    for (const config of configs) {
      const {card_id, font_id, signature_id, message, signature2_id, event} = config;

      //check card and font
      if (!event) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError());

      if (!card_id) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError(event, 'card'));

      if (!font_id) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError(event, 'font'));

      if (!message) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError(event, 'message'));

      const [card, font] = await Promise.all([db.card.findByPk(card_id, {raw: true}), db.fonts.findOne({
        where: {font_id},
        raw: true
      })])

      if (!card) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError(event, 'card'))

      if (!font) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError(event, 'font'))


      //check signature
      if (signature_id) {
        const signature = await db.signatures.findOne({where: {id: signature_id, user_id: user.id}, raw: true})
        if (!signature) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError(event, 'signature'))
      }

      if (signature2_id) {
        const signature = await db.signatures.findOne({where: {id: signature2_id, user_id: user.id}, raw: true})
        if (!signature) throw new ErrorHandler(INVALID_DATA, errorBuilder.buildRedtailError(event, 'signature'))
      }
    }
    next()
  } catch (e) {
    next(e)
  }
}

const checkAddressWithFile = (req, res, next) => {
  try {
    const {addresses, shipping_method, is_bulk, multiaddress} = req;

    let valid_body = []
    if (is_bulk && !multiaddress && !lodash.isEmpty(addresses)) {

      const {valid, intl} = addresses.reduce((acc, address) => {
        if (shipping_method.check_recipient_address) {
          acc.valid.push(...checkOnBlank(address, 'to'))

          if (!address.to_first_name) {
            acc.valid.push(createErrorObject(address.row, 'First Name', `To First Name cannot be blank (${address.sheet})`))
          }

          if (!address.to_address1) {
            acc.valid.push(createErrorObject(address.row, 'Address Line1', `To Address Line1 cannot be blank (${address.sheet})`))
          }

          if (!address.to_zip) {
            acc.valid.push(createErrorObject(address.row, 'Postal Code', `To Address Zip cannot be blank (${address.sheet})`))
          }

          if (address.to_zip && typeof address.to_zip === "number" && address.to_zip.length > 5) {
            acc.valid.push(createErrorObject(address.row, 'Postal Code', `To Address Zip cannot be blank and must be only 5 digits (${address.sheet})`))
          }

          if (!address.to_city) {
            acc.valid.push(createErrorObject(address.row, 'City', `To Address City cannot be blank (${address.sheet})`))
          }

          if (address.to_state && address.to_state.length > 2 && address.to_country_id) {
            acc.valid.push(createErrorObject(address.row, 'State', `To State cannot be blank and must be only 2 characters (${address.sheet})`))
          }

          if (!address.to_state) {
            acc.valid.push(createErrorObject(address.row, 'State', `To State cannot be blank (${address.sheet})`))
          }

          if (!address.to_country_id) {
            acc.valid.push(createErrorObject(address.row, 'Country', `To Country cannot be blank (${address.sheet})`))
          }
        }


        if (shipping_method.check_return_address) {
          acc.valid.push(...checkOnBlank(address, 'return'))

          if (!address.return_first_name) {
            acc.valid.push(createErrorObject(address.row, 'First Name', `Return First Name cannot be blank (${address.sheet})`))
          }

          if (!address.return_address1) {
            acc.valid.push(createErrorObject(address.row, 'Address Line1', `Return Address Line1 cannot be blank (${address.sheet})`))
          }

          if (!address.return_zip) {
            acc.valid.push(createErrorObject(address.row, 'Postal Code', `Return Address Zip cannot be blank (${address.sheet})`))
          }

          if (address.return_zip && typeof address.return_zip === "number" && address.return_zip.length > 5) {
            acc.valid.push(createErrorObject(address.row, 'Postal Code', `Return Address Zip cannot be blank and must be only 5 digits (${address.sheet})`))
          }

          if (!address.return_city) {
            acc.valid.push(createErrorObject(address.row, 'City', `Return Address City cannot be blank (${address.sheet})`))
          }

          if (address.return_state && address.return_state.length > 2 && address.return_country_id) {
            acc.valid.push(createErrorObject(address.row, 'State', `Return State cannot be blank and must be only 2 characters (${address.sheet})`))
          }

          if (!address.return_state) {
            acc.valid.push(createErrorObject(address.row, 'State', `Return State cannot be blank (${address.sheet})`))
          }

          if (!address.return_country_id) {
            acc.valid.push(createErrorObject(address.row, 'Country', `Return Country cannot be blank (${address.sheet})`))
          }

          if (address?.to_country_id && address.to_country_id !== 1) {
            acc.intl = true;
          }

        }

        return acc
      }, {valid: [], intl: false})

      req.intl = intl;
      if (!lodash.isEmpty(valid)) {

        return res.status(OK).json({
          httpCode: OK,
          status: 'ok',
          fileCorrect: false,
          messages: valid,
        })
      }

    }


    next()
  } catch (e) {
    next(e);
  }
}


const checkOnBlank = (address, type) => {
  const warning = [];
  for (const key in address) {
    if (key.includes(type)) {
      if (address[key] === ADDRESS_DEFAULT_VALUE) {
        warning.push(createErrorObject(address.row, addressFieldMap(type)[key], `${addressFieldMap(type)[key]} cannot be blank (${address.sheet})`))
      }
    }
  }
  return warning
}


const addressFieldMap = (type) => {
  const capitalizeAddressType = convert.capitalizeFirstLetter(type);

  return {
    [`${type}_first_name`]: `${capitalizeAddressType} Address First Name`,
    [`${type}_address1`]: `${capitalizeAddressType} Address Line 1`,
    [`${type}_city`]: `${capitalizeAddressType} Address City`,
    [`${type}_state`]: `${capitalizeAddressType} Address State`,
    [`${type}_zip`]: `${capitalizeAddressType} Address Zip`,
    [`${type}_country`]: `${capitalizeAddressType} Address Country`,
  };
};

const createErrorObject = (row, field, message) => ({row, field, message})

export const orderMiddleware = {
  addressValid,
  checkOrderConfig,
  checkAddressWithFile,
  createSendDateForPay,
  placeBasketBodyValid,
  check_shipping_method,
  checkValidBodyForSend,
  singleStepCheckValidData
}
