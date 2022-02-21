'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.changeColumn('order_config', 'event', {
      type: Sequelize.ENUM('birthday', 'anniversary', 'investment_letter_clients', 'investment_letter_prospects'),
      allowNull: false,
    }, {transaction: t})
  }),

  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.changeColumn('order_config', 'event', {
      type: Sequelize.ENUM('birthday', 'anniversary'),
      allowNull: false,
    }, {transaction: t})
  })
};
