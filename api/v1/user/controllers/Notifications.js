import {notificationService} from '../services'
import constants from "../../../../helpers/constants/constants.js";
import {ErrorHandler} from "../../../../middlewares/error.js";
import db from "../../../../db/models";
import {simpleCreateEntity} from "../../../../helpers/utils/model.utils.js";
import {getDataByUid} from "./Users.js";

const {OK, INVALID_DATA} = constants

const list = async (req, res, next) => {
  try {
    const {headers: {authorization}} = req;

    const user = await getDataByUid(authorization)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      notifications: await notificationService.getAll(user),
    })
  } catch (e) {
    next(e)
  }
}

const markAsRead = async (req, res, next) => {
  try {
    const {query: {id}, user} = req

    if (!id) {
      throw new ErrorHandler(INVALID_DATA, 'Invalid notification ID')
    }

    const notification = await db.notifications.findByPk(id)

    if (notification) {
      let urn = await notificationService.userNotification(user.id, notification.id)
      if (!urn) {

        await simpleCreateEntity('user_notifications_read', {notification_id: id, user_id: user.id})
      }
    } else {
      throw new ErrorHandler(INVALID_DATA, 'Invalid notification ID')
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
}

export const notificationController = {
  list,
  markAsRead
}

