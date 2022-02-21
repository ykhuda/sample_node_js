import sequelize from "sequelize";
import db from "../../../../db/models";
import {ErrorHandler} from "../../../../middlewares/error.js";
import constants from "../../../../helpers/constants/constants.js";

const {Op} = sequelize;
const {INVALID_DATA} = constants;

const getUserInsert = async (insert_id, user) => {
  const insert = await db.inserts.findOne({
    where: {
      id: insert_id,
      [Op.or]: [
        {user_id: user.id},
        {group_id: user.group_id},
      ]
    },
    raw: true,
    nest: true,
  })

  if (!insert) throw new ErrorHandler(INVALID_DATA, 'no such insert');

  return insert;
};

const getInsert = (user) => db.inserts.findAll({
  where: {
    ...(user?.group_id ? {group_id: {[Op.or]: [user.group_id, null]}} : {}),
    user_id: user.id,
    quantity: {
      [Op.gt]: 0,
    },
  },
  attributes: ['id', 'user_id', 'name', 'price', 'group_id'],
})

export const insertService = {
  getUserInsert,
  getInsert
};
