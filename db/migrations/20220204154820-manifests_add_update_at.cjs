'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.addColumn('manifests', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    }, {transaction: t})
  }),

  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.removeColumn('manifests', 'updated_at', {transaction: t})
  }),
};
