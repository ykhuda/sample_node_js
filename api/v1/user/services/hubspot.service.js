import db from "../../../../db/models";

const getHubspot = (where) => db.hs_portals.findOne({
  where: {
    ...where
  },
  raw: true,
  nest: true
})

const getHubspotPivot = (where) => db.hs_portal_users.findOne({
  where: {...where},
  include: [{model: db.hs_users}],
  raw: true,
  nest: true
})
export const hubspotService = {
  getHubspot,
  getHubspotPivot
}
