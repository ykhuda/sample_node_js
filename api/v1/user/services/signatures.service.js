import db from "../../../../db/models";
import {getUrl} from "../../../../helpers/utils/media/getUrl.js";

const getSignatures = async (userId) => {
  const signatures = await db.signatures.findAll({
    where: {
      user_id: userId,
    },
    attributes: ['id', 'preview', 'name'],
    order: [['id', 'ASC']],
    raw: true,
  })

  return signatures.map((sign) => ({
    ...sign,
    preview: getUrl(sign.preview, 'signatures'),
  }))
}

export const signatureService = {
  getSignatures,
}
