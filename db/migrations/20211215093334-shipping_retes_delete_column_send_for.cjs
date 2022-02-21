'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.removeColumn('shipping_rates', 'send_for', {transaction: t})
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.addColumn('shipping_rates', 'send_for', Sequelize.INTEGER(10), {transaction: t})
  }),
};
