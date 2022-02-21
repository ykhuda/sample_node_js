import aws from "@aws-sdk/client-sns";
import sequelize from "sequelize";
import fs from "fs";


import db from "../../../../db/models";
import {ErrorHandler} from "../../../../middlewares/error.js";
import {sendMail} from "../../../../helpers/utils/mail/mail.js";
import constants from "../../../../helpers/constants/constants.js";
import {simpleUpdateEntity, transaction} from "../../../../helpers/utils/model.utils.js";
import {client} from "../../../../helpers/utils/notification/push.notification.js";
import {decodeToken, getDataByUid} from "./Users.js";

const {CreatePlatformEndpointCommand, SetEndpointAttributesCommand, SubscribeCommand} = aws;
const {Op} = sequelize;
const {INVALID_DATA, emailTemplates, OK, ADMIN_MAIL} = constants

const feedBack = (req, res, next) => transaction(async t => {
  try {
    const {name, email, message} = req.body

    const created_at = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()} ${new Date().getHours()}:${new Date().getMinutes()}`

    if (!name) throw new ErrorHandler(INVALID_DATA, 'empty name')

    if (!email) {
      throw new ErrorHandler(INVALID_DATA, 'empty email')
    } else if (email.search(/\w+@\w+\.\w+/gi) === -1) {
      throw new ErrorHandler(INVALID_DATA, 'Invalid Email')
    }
    if (!message) throw new ErrorHandler(INVALID_DATA, 'empty message')

    await sendMail(emailTemplates.FEEDBACK, ADMIN_MAIL, {name, email, message, created_at})

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
})

const whitePaper = async (req, res, next) => {
  try {
    const {firstName, lastName, email, phone} = req.body

    if (!firstName) throw new ErrorHandler(INVALID_DATA, 'empty first name')
    if (!lastName) throw new ErrorHandler(INVALID_DATA, 'empty last name')

    if (!email) {
      throw new ErrorHandler(INVALID_DATA, 'empty email')
    } else if (email.search(/\w+@\w+\.\w+/gi) === -1) {
      throw new ErrorHandler(INVALID_DATA, 'Invalid Email')
    }
    if (!phone) throw new ErrorHandler(INVALID_DATA, 'empty phone')

    const created_at = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()} ${new Date().getHours()}:${new Date().getMinutes()}`


    await sendMail(emailTemplates.WHITEPAPER, email, {firstName, lastName, email, phone, created_at})

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
}

const sample = async (req, res, next) => {
  try {
    const {firstName, lastName, company, email, phone, address1, address2, city, zip, state, country} = req.body

    const created_at = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()} ${new Date().getHours()}:${new Date().getMinutes()}`

    if (!firstName) throw new ErrorHandler(INVALID_DATA, 'empty first name')

    if (!lastName) throw new ErrorHandler(INVALID_DATA, 'empty last name')

    if (!email) {
      throw new ErrorHandler(INVALID_DATA, 'empty email')
    } else if (email.search(/\w+@\w+\.\w+/gi) === -1) {
      throw new ErrorHandler(INVALID_DATA, 'Invalid Email')
    }
    if (!phone) throw new ErrorHandler(INVALID_DATA, 'empty phone')

    if (!address1) throw new ErrorHandler(INVALID_DATA, 'empty address 1')

    if (!city) throw new ErrorHandler(INVALID_DATA, 'empty city')

    if (!zip) throw new ErrorHandler(INVALID_DATA, 'empty zip')

    await sendMail(emailTemplates.SAMPLES, email, {
      firstName,
      lastName,
      email,
      phone,
      company,
      address1,
      address2,
      city,
      zip,
      state,
      country,
      created_at,
    })

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
}

const registerToken = (req, res, next) => transaction(async (t) => {
  try {
    let {body: {uid, device_token, token}, headers: {authorization}} = req;
    const {locals: {platform}} = res;

    let user;
    if (!device_token) {
      throw new ErrorHandler(INVALID_DATA, 'invalid device token');
    }

    let data = ''
    if (!uid) {
      const key = decodeToken(token);
      if (key) {
        uid = key.uid
      }
    }

    let auth
    if (uid) {
      auth = await getDataByUid(uid)
      if (!auth) {
        throw new ErrorHandler('cannot identify user')
      } else {
        req.session.save()
      }
      user = auth.user
      data = `id:${user.id},login:${user.login},fname:${user.fname},lname:${user.lname}`
    }

    let app_arn
    let topic_arn
    if (platform === 'android') {
      app_arn = process.env.AWS_SNS_ANDROID_APP_ARN
      topic_arn = process.env.AWS_SNS_ANDROID_TOPIC_ARN
    } else {
      app_arn = process.env.AWS_SNS_APP_ARN
      topic_arn = process.env.AWS_SNS_TOPIC_ARN
    }

    const platformSns = await client.send(new CreatePlatformEndpointCommand({
      PlatformApplicationArn: app_arn,
      Token: device_token,
      CustomUserData: data,
    }))
    const {EndpointArn} = platformSns

    await client.send(new SetEndpointAttributesCommand({
      EndpointArn,
      Attributes: {
        Enabled: true,
        CustomUserData: data,
      },
    }))

    await client.send(new SubscribeCommand({
      TopicArn: topic_arn,
      Protocol: 'application',
      Endpoint: EndpointArn,
    }))

    // save endpoint
    if (EndpointArn && auth) {
      await Promise.all([
        simpleUpdateEntity('auth_uid', {user_id: user.id}, {endpoint_arn: EndpointArn}, t),
        simpleUpdateEntity('auth_uid', {
          id: {[Op.not]: auth.id},
          endpoint_arn: EndpointArn,
        }, {endpoint_arn: null}, t),
      ])
    }
    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
})

const getCustomCss = async (req, res, next) => {
  try {
    const fonts = await db.fonts.findAll({raw: true})

    const dir = `./tmp`
    const filePath = `${dir}/fonts.css`

    if (!fs.existsSync(dir)) {
      fs.mkdir(dir, (e) => {
        if (e) throw new ErrorHandler(INVALID_DATA, e)
      })
    }
    await fonts.map(async (font) => {
      const fileContent = `
      @font-face {
          font-family: ${font.id};
          src: url('${font.font_file}') format('truetype');
      }
      `
      await fs.appendFile(filePath, fileContent, (err) => {
        if (err) {
          throw new ErrorHandler(INVALID_DATA, err)
        }
      })
    })


    res.writeHead(200, {
      'Content-Type': 'text/css',
    });

    const readStream = fs.createReadStream(filePath);
    // We replaced all the event handlers with a simple call to readStream.pipe()
    readStream.pipe(res);
    readStream.on('end', () => {
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, err => {
          if (err) throw new ErrorHandler(INVALID_DATA, err)
        })
      }
    });
  } catch (e) {
    next(e)
  }
}

export const defaultController = {
  whitePaper,
  feedBack,
  sample,
  registerToken,
  getCustomCss,
}
