import {simpleUpdateEntity} from "../../../../helpers/utils/model.utils.js";

const setBillingInfo = async (user_id, address, country_id, zip, t) => {
  await simpleUpdateEntity('user', {id: user_id}, {
    billing_address: address,
    billing_country_id: country_id,
    billing_zip: zip,
  }, t)
}


export const profileService = {
  setBillingInfo
}
