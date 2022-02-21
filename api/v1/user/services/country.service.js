import db from '../../../../db/models'

const getCountriesList = () => db.country.findAll({
  include: [
    {
      model: db.states,
      attributes: ['name', 'short_name'],
      separate: true,
    },
  ],
})

const getStatesList = (countryId) => db.states.findAll({
  where: {
    country_id: countryId,
  },
  attributes: ['id', 'short_name', 'name'],
})

const getCountry = (countryId) => db.country.findByPk(countryId, {raw: true})

export const countryService = {
  getCountriesList,
  getStatesList,
  getCountry,
}
