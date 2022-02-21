import {findEntity, simpleUpdateEntity} from "../helpers/utils/model.utils.js";
import constants from "../helpers/constants/constants.js";
import {ErrorHandler} from "./error.js";
import {profileService} from "../api/v1/user/services";

const {INVALID_DATA} = constants;

export const check_billing_info = async (req, res, next) => {
  try {
    const {user} = req;
    let addressFrom = null;

    if (!user.billing_country_id && !user.billing_zip && !user.billing_address) {
      addressFrom = await findEntity('address', null, {user_id: user.id, type: 'user_from'}, null, null, null);

      if (addressFrom) {
        await profileService.setBillingInfo(user.id, addressFrom.address1, addressFrom.id, addressFrom.zip)
      }
    }


    if (!addressFrom && !user.billing_country_id && !user.billing_zip && !user.billing_address) {
      throw new ErrorHandler(INVALID_DATA, 'Please, fill physical address!')
    }

    next()
  } catch (e) {
    next(e)
  }
}
