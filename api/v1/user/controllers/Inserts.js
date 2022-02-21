import {insertService} from "../services";
import constants from "../../../../helpers/constants/constants.js";

const {OK} = constants

const list = async (req, res, next) => {
  try {
    const {user} = req;

    const inserts = await insertService.getInsert(user);

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      inserts,
    })
  } catch (e) {
    next(e)
  }


}

export const insertController = {
  list,
}
