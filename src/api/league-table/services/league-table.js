'use strict';

/**
 * league-table service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::league-table.league-table');
