'use strict';
const {Op} = require('sequelize')

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(t => queryInterface.bulkInsert('shipping_rates', [
      {
        name: 'Ground',
        base: 10,
        per_card_fee: 0.05,
        minimum_fee: 20,
        sort_order: 1,
        status: 1,
      },
      {
        name: '2-Day',
        base: 10,
        per_card_fee: 0.17,
        minimum_fee: 45,
        sort_order: 2,
        status: 1,
      },
      {
        name: 'Overnight',
        base: 20,
        per_card_fee: 0.22,
        minimum_fee: 70,
        sort_order: 3,
        status: 1,
      },
      {
        name: 'Overnight Priority',
        base: 45,
        per_card_fee: 0.25,
        minimum_fee: 100,
        sort_order: 4,
        status: 1,
      },
    ], {transaction: t}))
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(t => queryInterface.bulkDelete('shipping_rates', {
      [Op.or]: [
        {
          name: 'Ground',
          base: 10,
          status: 1,
        },
        {
          name: '2-Day',
          base: 10,
          status: 1,
        },
        {
          name: 'Overnight',
          base: 20,
          status: 1,
        },
        {
          name: 'Overnight Priority',
          base: 45,
          status: 1,
        },
      ]
    }))
  }
};
