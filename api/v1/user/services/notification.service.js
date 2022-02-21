import sequelize from "sequelize";

import constants from "../../../../helpers/constants/constants.js";
import db from '../../../../db/models'

const {Op} = sequelize;
const {NOTIFICATION_STATUS} = constants;

const getAll = (user) => db.notifications.findAll({
  where: {
    status: NOTIFICATION_STATUS.ACTIVE,
    ...(user ?
      [
        sequelize.literal(`(visible_to_all or (select id from notification_user_groups where notification_id=notifications.id and user_group_id=${user.group_id}))`),
        sequelize.literal(`id not in (select notification_id from user_notifications_read where user_id=${user.id})`)
      ]
      : {visible_to_guest: 1}),
    starts_at: {
      [Op.or]: [
        null,
        {[Op.lt]: sequelize.fn('NOW')},
      ],
    },
    ends_at: {
      [Op.or]: [
        null, {[Op.gt]: sequelize.fn('NOW')},
      ],
    },
  },
  order: [['id', 'ASC']],
  raw: true,
})

const userNotification = (user_id, notification_id) => db.user_notifications_read.findOne({
  where: {
    user_id,
    notification_id,
  },
})

export const notificationService = {
  userNotification,
  getAll,
}
