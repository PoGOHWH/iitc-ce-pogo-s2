// ==UserScript==
// @id             iitc-plugin-pogo
// @name           IITC plugin: pogo for portals
// @category       Controls
// @version        0.5
// @description    Mark Ingress portals as a pokestop or gym in Pokemon Go. 
// @include        https://www.ingress.com/intel*
// @include        https://ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          https://ingress.com/intel*
// @include        https://www.ingress.com/mission/*
// @match          https://www.ingress.com/mission/*
// @grant          none
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */

/* globals $, L, GM_info, plugin, dialog */
/* globals renderPortalDetails, findPortalGuidByPositionE6 */

;(function () {	// eslint-disable-line no-extra-semi
	'use strict';

	const plugin_info = {};
	if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
		plugin_info.script = {
			version: GM_info.script.version,
			name: GM_info.script.name,
			description: GM_info.script.description
		};
	}


	const setup = function () {

		alert('The iitc-plugin-pogo, "pogo for portals" plugin is outdated and its features are included in "s2Check".\r\n' +
			'Please, uninstall this plugin to avoid conflicts');

	};

	// PLUGIN END //////////////////////////////////////////////////////////

	setup.info = plugin_info; //add the script info data to the function as a property
	if (!window.bootPlugins) {
		window.bootPlugins = [];
	}
	window.bootPlugins.push(setup);
	// if IITC has already booted, immediately run the 'setup' function
	if (window.iitcLoaded && typeof setup === 'function') {
		setup();
	}
})();

