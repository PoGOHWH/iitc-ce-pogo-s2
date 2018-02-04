// ==UserScript==
// @id             iitc-plugin-pogo
// @name           IITC plugin: pogo for portals
// @category       Controls
// @version        0.3.2.20160507.234802
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

/* globals $, L, GM_info, plugin, android, dialog, map */
/* globals escapeHtmlSpecialChars, zoomToAndShowPortal, renderPortalDetails */

function wrapper(plugin_info) {
	'use strict';

	// ensure plugin framework is there, even if iitc is not yet loaded
	if (typeof window.plugin !== 'function') {
		window.plugin = function () {};
	}

	// PLUGIN START ////////////////////////////////////////////////////////
	/***********************************************************************

     HOOKS:
     - pluginpogoEdit: fired when a pogo/folder is removed, added or sorted, also when a folder is opened/closed;

     ***********************************************************************/
	////////////////////////////////////////////////////////////////////////

	// use own namespace for plugin
	window.plugin.pogo = function () {};

	window.plugin.pogo.KEY_OTHER_pogo = 'idOthers';
	window.plugin.pogo.KEY_STORAGE = 'plugin-pogo';

	window.plugin.pogo.pogoObj = {};

	window.plugin.pogo.stopLayers = {};
	window.plugin.pogo.stopLayerGroup = null;
	window.plugin.pogo.gymLayers = {};
	window.plugin.pogo.gymLayerGroup = null;

	window.plugin.pogo.isSmart = undefined;
	window.plugin.pogo.isAndroid = function () {
		if (typeof android !== 'undefined' && android) {
			return true;
		}
		return false;
	};

	/*********************************************************************************************************************/

	// Generate an ID for the pogo (date time + random number)
	window.plugin.pogo.generateID = function () {
		var d = new Date();
		var ID = d.getTime() + (Math.floor(Math.random() * 99) + 1);
		return 'id' + ID.toString();
	};

	// Update the localStorage
	window.plugin.pogo.saveStorage = function () {
		localStorage[plugin.pogo.KEY_STORAGE] = JSON.stringify(window.plugin.pogo.pogoObj);
	};
	// Load the localStorage
	window.plugin.pogo.loadStorage = function () {
		window.plugin.pogo.pogoObj = JSON.parse(localStorage[plugin.pogo.KEY_STORAGE]);
		var newplugin = {
			'maps': {'idOthers': {'label': 'Others', 'state': 1, 'pogo': {}}},
			'portals': {'idOthers': {'label': 'Others', 'state': 1, 'pogo': {}}}
		};
		if (window.plugin.pogo.pogoObj === newplugin) {
			console.log('New plugin');
		} else {
			console.log('Existing data present');
		}
	};

	window.plugin.pogo.createStorage = function () {
		if (!localStorage[window.plugin.pogo.KEY_STORAGE]) {
			window.plugin.pogo.pogoObj.maps = {idOthers: {label: 'Others', state: 1, pogo: {}}};
			window.plugin.pogo.pogoObj.portals = {idOthers: {label: 'Others', state: 1, pogo: {}}};
			window.plugin.pogo.saveStorage();
		}
	};

	window.plugin.pogo.refreshpogo = function () {
		$('#pogo_maps > ul, #pogo_portals > ul').remove();
		window.plugin.pogo.loadStorage();
		window.plugin.pogo.updateStarPortal();
	};

	/***************************************************************************************************************************************************************/

	window.plugin.pogo.findByGuid = function (guid) {
		var list = window.plugin.pogo.pogoObj['portals'];
		for (var idFolders in list) {
			for (var idpogo in list[idFolders]['pogo']) {
				var portalGuid = list[idFolders]['pogo'][idpogo]['guid'];
				if (guid === portalGuid) {
					return {'id_folder': idFolders, 'id_pogo': idpogo};
				}
			}
		}

	};

	// Append a 'star' flag in sidebar.
	window.plugin.pogo.onPortalSelectedPending = false;
	window.plugin.pogo.onPortalSelected = function () {
		$('.pogoStar').remove();
		$('.pogoGym').remove();

		if (window.selectedPortal == null) {
			return;
		}

		if (!window.plugin.pogo.onPortalSelectedPending) {
			window.plugin.pogo.onPortalSelectedPending = true;

			setTimeout(function () { // the sidebar is constructed after firing the hook
				window.plugin.pogo.onPortalSelectedPending = false;

				$('.pogoStar').remove();
				$('.pogoGym').remove();

				if (typeof Storage === 'undefined') {
					$('#portaldetails > .imgpreview').after(plugin.pogo.htmlDisabledMessage);
					return;
				}

				// Prepend a star to mobile status-bar
				if (window.plugin.pogo.isSmart) {
					$('#updatestatus').prepend(plugin.pogo.htmlStar);
					$('#updatestatus .pogoStar').attr('title', '');
				}

				$('#portaldetails > h3.title').before(plugin.pogo.htmlStar);
				window.plugin.pogo.updateStarPortal();
			}, 0);
		}
	};

	// Update the status of the star (when a portal is selected from the map/pogo-list)
	window.plugin.pogo.updateStarPortal = function () {
		var guid = window.selectedPortal;
		$('.pogoStar').removeClass('favorite');
		$('.pogoGym').removeClass('favorite');
		$('.pogo a.pogoLink.selected').removeClass('selected');

		// If current portal is into pogo: select pogo portal from portals list and select the star
		if (localStorage[window.plugin.pogo.KEY_STORAGE].search(guid) != -1) {
			var pogoData = window.plugin.pogo.findByGuid(guid);
			if (pogoData) {
				var list = window.plugin.pogo.pogoObj['portals'];
				$('.pogo#' + pogoData['id_pogo'] + ' a.pogoLink').addClass('selected');
				if (list[pogoData['id_folder']]['label'] === 'pokestop') {
					$('.pogoStar').addClass('favorite');
				}
				if (list[pogoData['id_folder']]['label'] === 'gym') {
					$('.pogoGym').addClass('favorite');
				}
			}
		}
	};

	// Switch the status of the star
	window.plugin.pogo.switchStarPortal = function (type) {
		var guid = window.selectedPortal;

		// If portal is saved in pogo: Remove this pogo
		var pogoData = window.plugin.pogo.findByGuid(guid);
		if (pogoData) {
			var list = window.plugin.pogo.pogoObj['portals'];
			// Get portal name and coordinates
			var p = window.portals[guid];
			var ll = p.getLatLng();
			delete list[pogoData['id_folder']]['pogo'][pogoData['id_pogo']];
			$('.pogo#' + pogoData['id_pogo'] + '').remove();

			window.plugin.pogo.saveStorage();
			window.plugin.pogo.updateStarPortal();

			window.runHooks('pluginpogoEdit', {
				'target': 'portal',
				'action': 'remove',
				'folder': pogoData['id_folder'],
				'id': pogoData['id_pogo'],
				'guid': guid
			});
			console.log('pogo: removed portal (' + pogoData['id_pogo'] + ' situated in ' + pogoData['id_folder'] + ' folder)');
			if (list[pogoData['id_folder']].label !== type) {
				if (type === 'gym') {
					plugin.pogo.addPortalpogo(guid, ll.lat + ',' + ll.lng, p.options.data.title, 'gym');
				}
				if (type === 'pokestop') {
					plugin.pogo.addPortalpogo(guid, ll.lat + ',' + ll.lng, p.options.data.title, 'pokestop');
				}
			} else {
				plugin.pogo.addPortalpogo(guid, ll.lat + ',' + ll.lng, p.options.data.title, 'none');
			}
		} else {
			// If portal isn't saved in pogo: Add this pogo
	
			// Get portal name and coordinates
			var portal = window.portals[guid];
			var latlng = portal.getLatLng();
			plugin.pogo.addPortalpogo(guid, latlng.lat + ',' + latlng.lng, portal.options.data.title, type);
		}
	};

	//Add folders for gyms and pokestops
	window.plugin.pogo.addFolder = function (label) {
		var ID = window.plugin.pogo.generateID();
		var type = 'folder';

		// Add new folder in the localStorage
		window.plugin.pogo.pogoObj['portals'][ID] = {'label': label, 'state': 1, 'pogo': {}};

		window.plugin.pogo.saveStorage();
		window.plugin.pogo.refreshpogo();
		window.runHooks('pluginpogoEdit', {'target': type, 'action': 'add', 'id': ID});
		console.log('pogo: added ' + type + ' ' + ID);
	};

	//check if folders exist
	window.plugin.pogo.checkFolder = function () {
		var list = window.plugin.pogo.pogoObj['portals'];
		var gym = 0, 
			pokestop = 0, 
			none = 0;
		for (var idFolders in list) {
			var folders = list[idFolders];
			if (folders['label'] === 'gym') {
				gym = 1;
			}
			if (folders['label'] === 'pokestop') {
				pokestop = 1;
			}
			if (folders['label'] === 'none') {
				none = 1;
			}
		}
		if (gym === 0) {
			window.plugin.pogo.addFolder('gym');
		}
		if (pokestop === 0) {
			window.plugin.pogo.addFolder('pokestop');
		}
		if (none === 0) {
			window.plugin.pogo.addFolder('none');
		}
	};

	// Add portal
	plugin.pogo.addPortalpogo = function (guid, latlng, label, type) {
		var ID = window.plugin.pogo.generateID();
		if (!window.plugin.pogo.pogoObj['portals'][window.plugin.pogo.KEY_OTHER_pogo]['pogo']) {
			window.plugin.pogo.pogoObj['portals'][window.plugin.pogo.KEY_OTHER_pogo]['pogo'] = {};
		}
		window.plugin.pogo.checkFolder();

		var typeID = '';
		var list = window.plugin.pogo.pogoObj['portals'];
		for (var idFolders in list) {
			var folders = list[idFolders];
			if (folders['label'] === type) {
				typeID = idFolders;
			}
		}

		// Add pogo in the localStorage
		window.plugin.pogo.pogoObj['portals'][typeID]['pogo'][ID] = {'guid': guid, 'latlng': latlng, 'label': label};

		window.plugin.pogo.saveStorage();
		window.plugin.pogo.refreshpogo();
		window.runHooks('pluginpogoEdit', {
			'target': 'portal',
			'action': 'add',
			'id': ID,
			'guid': guid,
			'type': typeID,
			'latlng': latlng,
			'lbl': label
		});
		console.log('pogo: added portal ' + ID);
	};

	/***************************************************************************************************************************************************************/
	/** OPTIONS ****************************************************************************************************************************************************/
	/***************************************************************************************************************************************************************/
	// Manual import, export and reset data
	window.plugin.pogo.manualOpt = function () {
		dialog({
			html: plugin.pogo.htmlSetbox,
			dialogClass: 'ui-dialog-pogoSet',
			title: 'PoGo Options'
		});
	};

	window.plugin.pogo.optAlert = function (message) {
		$('.ui-dialog .ui-dialog-buttonset').prepend('<p class="pogo-alert" style="float:left;margin-top:4px;">' + message + '</p>');
		$('.pogo-alert').delay(2500).fadeOut();
	};

	window.plugin.pogo.optCopy = function () {
		if (typeof android !== 'undefined' && android && android.shareString) {
			return android.shareString(localStorage[window.plugin.pogo.KEY_STORAGE]);
		}
        
		dialog({
			html: '<p><a onclick="$(\'.ui-dialog-pogoSet-copy textarea\').select();">Select all</a> and press CTRL+C to copy it.</p><textarea readonly>' + localStorage[window.plugin.pogo.KEY_STORAGE] + '</textarea>',
			dialogClass: 'ui-dialog-pogoSet-copy',
			title: 'PoGo Export'
		});
        
	};

	window.plugin.pogo.optExport = function () {
		if (typeof android !== 'undefined' && android && android.saveFile) {
			android.saveFile('IITC-pogo.json', 'application/json', localStorage[window.plugin.pogo.KEY_STORAGE]);
		}
	};

	window.plugin.pogo.optPaste = function () {
		var promptAction = prompt('Press CTRL+V to paste it.', '');
		if (promptAction !== null && promptAction !== '') {
			try {
				var list = JSON.parse(promptAction); // try to parse JSON first
				for (var idFolders in list['portals']) {
					for (var idpogo in list['portals'][idFolders]['pogo']) {
						var latlng = list['portals'][idFolders]['pogo'][idpogo].latlng;
						var guid = list['portals'][idFolders]['pogo'][idpogo].guid;
						var lbl = list['portals'][idFolders]['pogo'][idpogo].label;
						var type = list['portals'][idFolders].label;
						if (localStorage[window.plugin.pogo.KEY_STORAGE].search(guid) === -1) {
							plugin.pogo.addPortalpogo(guid, latlng, lbl, type);
						}
					}
				}
				window.plugin.pogo.refreshpogo();
				window.runHooks('pluginpogoEdit', {'target': 'all', 'action': 'import'});
				window.plugin.pogo.optAlert('Successful. ');
			} catch (e) {
				console.warn('pogo: failed to import data: ' + e);
				window.plugin.pogo.optAlert('<span style="color: #f88">Import failed </span>');
			}
		}
	};



	window.plugin.pogo.optImport = function () {
		if (window.requestFile === undefined) {
			return;
		}
		window.requestFile(function (filename, content) {
			try {
				JSON.parse(content); // try to parse JSON first
				localStorage[window.plugin.pogo.KEY_STORAGE] = content;
				window.plugin.pogo.refreshpogo();
				window.runHooks('pluginpogoEdit', {'target': 'all', 'action': 'import'});
				window.plugin.pogo.optAlert('Successful. ');
			} catch (e) {
				console.warn('pogo: failed to import data: ' + e);
				window.plugin.pogo.optAlert('<span style="color: #f88">Import failed </span>');
			}
		});
	};

	window.plugin.pogo.optReset = function () {
		var promptAction = confirm('All pogo will be deleted. Are you sure?', '');
		if (promptAction) {
			delete localStorage[window.plugin.pogo.KEY_STORAGE];
			window.plugin.pogo.createStorage();
			window.plugin.pogo.loadStorage();
			window.plugin.pogo.refreshpogo();
			window.runHooks('pluginpogoEdit', {'target': 'all', 'action': 'reset'});
			window.plugin.pogo.optAlert('Successful. ');
		}
	};

	/***************************************************************************************************************************************************************/
	/** POKEMON GO PORTALS LAYER ***********************************************************************************************************************************/
	/***************************************************************************************************************************************************************/
	window.plugin.pogo.addAllStars = function () {
		var list = window.plugin.pogo.pogoObj.portals;

		for (var idFolders in list) {
			for (var idpogo in list[idFolders]['pogo']) {
				var latlng = list[idFolders]['pogo'][idpogo].latlng.split(',');
				var guid = list[idFolders]['pogo'][idpogo].guid;
				var lbl = list[idFolders]['pogo'][idpogo].label;
				var type = list[idFolders].label;
				window.plugin.pogo.addStar(guid, latlng, lbl, type);
			}
		}
	};

	window.plugin.pogo.resetAllStars = function () {
		for (var guid in window.plugin.pogo.stopLayers) {
			var starInLayer = window.plugin.pogo.stopLayers[guid];
			window.plugin.pogo.stopLayerGroup.removeLayer(starInLayer);
			delete window.plugin.pogo.stopLayers[guid];
		}
		for (var guid in window.plugin.pogo.gymLayers) {
			var gymInLayer = window.plugin.pogo.gymLayers[guid];
			window.plugin.pogo.gymLayerGroup.removeLayer(gymInLayer);
			delete window.plugin.pogo.gymLayers[guid];
		}
		window.plugin.pogo.addAllStars();
	};

	window.plugin.pogo.addStar = function (guid, latlng, lbl, type) {
		var markerimg = '';
		if (type === 'pokestop') {
			markerimg = 'data:image/png;base64,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';
		}
		if (type === 'gym') {
			markerimg = 'data:image/png;base64,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';
		}
		var star = L.marker(latlng, {
			title: lbl,
			icon: L.icon({
				iconUrl: markerimg,
				iconAnchor: [15, 40],
				iconSize: [30, 40]
			})
		});
		window.registerMarkerForOMS(star);
		star.on('spiderfiedclick', function () { renderPortalDetails(guid); });

		if (type === 'pokestop') {
			window.plugin.pogo.stopLayers[guid] = star;
			star.addTo(window.plugin.pogo.stopLayerGroup);
		}
		if (type === 'gym') {
			window.plugin.pogo.gymLayers[guid] = star;
			star.addTo(window.plugin.pogo.gymLayerGroup);
		}
	};

	window.plugin.pogo.editStar = function (data) {
		if (data.target === 'portal') {
			if (data.action === 'add') {
				var guid = data.guid;
				if (window.portals[guid] === undefined) {
					var latlng = data.latlng.split(',');
				} else {
					var latlng = window.portals[guid].getLatLng();
				}
				var lbl = data.lbl;
				var starInLayer = window.plugin.pogo.stopLayers[data.guid];
				var type = window.plugin.pogo.pogoObj['portals'][data.type].label;
				window.plugin.pogo.addStar(guid, latlng, lbl, type);
			} else if (data.action === 'remove') {
				var type = window.plugin.pogo.pogoObj['portals'][data.folder].label;
				if (type === 'pokestop') {
					var starInLayer = window.plugin.pogo.stopLayers[data.guid];
					window.plugin.pogo.stopLayerGroup.removeLayer(starInLayer);
					delete window.plugin.pogo.stopLayers[data.guid];
				}
				if (type === 'gym') {
					var gymInLayer = window.plugin.pogo.gymLayers[data.guid];
					window.plugin.pogo.gymLayerGroup.removeLayer(gymInLayer);
					delete window.plugin.pogo.gymLayers[data.guid];
				}
			}
		} else if ((data.target === 'all' && (data.action === 'import' || data.action === 'reset')) || (data.target === 'folder' && data.action === 'remove')) {
			window.plugin.pogo.resetAllStars();
		}
	};

	/***************************************************************************************************************************************************************/

	window.plugin.pogo.setupCSS = function () {
		$('<style>').prop('type', 'text/css').html(`
#sidebar #portaldetails h3.title{
	width:auto;
}
.pogoStar span, .pogoGym span {
	display:inline-block;
	float:left;
	margin:3px 1px 0 4px;
	width:16px;
	height:15px;
	overflow:hidden;
	background-repeat:no-repeat;
}
.pogoStar span, .pogoStar.favorite:focus span, .pogoGym span, .pogoGym.favorite:focus span {
	background-position:left top;
}
.pogoStar:focus span, .pogoStar.favorite span, .pogoGym:focus span, .pogoGym.favorite span {
	background-position:right top;
}

/**********************************************
	MOBILE
**********************************************/
#updatestatus .pogoStar{
	float:left;
	margin:-19px 0 0 -5px;
	padding:0 3px 1px 4px;
	background:#262c32;
}

/**********************************************
	DIALOG BOX
**********************************************/

/*---- Options panel -----*/
#pogoSetbox a{
	display:block;
	color:#ffce00;
	border:1px solid #ffce00;
	padding:3px 0;
	margin:10px auto;
	width:80%;
	text-align:center;
	background:rgba(8,48,78,.9);
}
#pogoSetbox a.disabled,
#pogoSetbox a.disabled:hover{
	color:#666;
	border-color:#666;
	text-decoration:none;
}
/*---- Opt panel - copy -----*/
.ui-dialog-pogoSet-copy textarea{
	width:96%;
	height:120px;
	resize:vertical;
}

#pogoSetbox{
	text-align:center;
}
.pogoStar span {
	background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAPCAMAAACyXj0lAAACZFBMVEUAAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAQECAAAAAAAGAQEAAAAPDw8AAAAMAgIAAAALAQEBAQETAwMAAAAGBQUMAgISEhIAAAAWFhYBAQEWAwMAAAACAgIDAwMFBQUGBgYJCQkPDw8REREVGBgWFhYXFxchISEiIiIkICAoKCgpICAtLCwtLi4uBQUuKysuLy8vEBAvMjEyMDAzMzM0NDQ4ODg5OTk6Ojo+Pj5AQUFBS0tCSEhDQ0NISEhJSUlMTExSUlJUVFRWVlZXV1dYCwtZCwtaWlpcXFxeXl5gYGBhBgZiYmJjY2NlDAxmDAxnZ2doaGhra2tsbGxtbW1wcHBwfHtxcXFycnJ0dHR1dXV2dnZ4CQl5eXl9fX2CgoKEhISFhYWGhoaIiIiIiomJh4qKioqLi4uMjIyNjY2PiZCQkJCUlJSXBASaERGanJycBAScnJytFRWuDg6urq6wFBS2wcG3t7e4FRW5t7q6Cwu6urq7Dg6+vr7CwsLDwMTEDg7FxcXHxsfIyMjJFxfKDw/MDg7MzMzPz8/P0NDQ0NDRDw/RFxfS09XX19faGBja2trbExPc3NzlGhrl5eXo6Ojs7u7u7u7vGxvwGhrw8PDyGhry8vLz8/P0Ghr3Gxv39/f4+Pj8/Pz8/v79/f3+////HBz/HR3/Hh7///9j6e8DAAAAPnRSTlMAAAIKDBIWGBshJTI0O0tQY2VocnN1fImVnZ6lqKmrrLCxs7u8vb3G0tbW1tra39/i4uXl7Ozv7+/v8fH6+jTKPt8AAAGeSURBVHgBYwACZiFlAxMdWT4Qm5ERImBoqgsUgAAeDfe8hsbaZEd5VpACkED6rK27Nk4IAAoAAbdZVldXd3dXV5OXOgtIAbfFlFMnT5w4eXJ3IVCAgVkzGywNJJo9JIAKmLWnnwJJA9XszZBgYBD0AEp1F2fWd3W3VtpwMTIKZgDlT8yZtPnUiYPrbLkYVEuBuj3t7OxyurpbPEUYGdWWnTp5MjeuwnfqqRMHCkQYjIoqK9Psqu2jHapqyiKlGRmN5y1f3h+7vn1G8Iq1i+qkGczsgMDewS7JDgSUGBnN/fyD3Np67BaG+IUGeisx6M0/fbrELjXK0e7QsfkukoyM+jtOn17ts2R2d8zR4zsmSjIoRJ8+fdoVqLn59LYFdgKMjApzgQKTw+KjN50+vDNPgIHf7jQQLO0EEqvyzdgYGfkTQAJ7tgCJfSst2RiYVJxPQ8E0O2FgODCp9MEEticKA0OSQ9NhP5jbYCcFDmoOrY4jYIENSVLguGCXs3NKKY2wsxIDRxZIILx38ZqZ5dZAAQjgFVdUlhHlhMQmmgAAN4GpuWb98MUAAAAASUVORK5CYII=);
}
.pogoGym span {
	background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAPCAMAAACyXj0lAAAC7lBMVEUAAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEAAAAAAAAAAAAAAAAAAAABAQEAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAADAwMAAAAAAAABAQIAAAAAAAAAAAAAAAAAAAACAgIAAAAAAAABAAAAAAAAAAAAAAAAAAACAgIAAAAHBwcAAAACAgIAAAAbBgYBAQEBAQEZBgcAAAAAAAAAAAABAQEXFxcCAgICAgIHBAUBAQEGBgdyFRcRERFsFRYCAgIDAwMFBQUODg4EBAQFBQUREREFBQUGBgYTExMRCQoEBAQGBAVcIiYaGhoaGhsFBQUUFBRaJSgGBgYdFBgDAwMEBAQNDQ0ODg4fHyAjIyNYWFheLTEHBgcHBwgJCQkLCwsNDQ0PDw8RERESEhIUFBQVFRYWFhYXFxcYGBgZGRkZGRoaGhocHBwdHR0eHh4eHx8fHx8iIiIlJSUmJiYnJycpKSkqKiotLS0uLi4uLi8wMDAyMjIzMzM0NDQ2NjY4ODg6Ojo7Ozs7Oz09PT4+Pj4/Pz9DKS9DQ0NJSUpLS0xMTE1NTU1PT09QUFBRUVFSUlNXV1dZWVlbW1tcXFxeXl5eXl9jY2NkZGRmZmZoaGlsbG1wcHBycnJ1dXV7e3t/f3+AgYGBgYGFhYWIh4mPj4+THyGTk5SVlZWYmJqbm5ygoKCnp6irq6uvr6+wr7KwsLGxsbO1tbW3tri4t7m5ubu9HyDGxcjGxsfJJyjOzs7PHR7QIyTQ0NDR0dHSICHS0tLU1NTY2NjZ2dndIiPd3d3e3t7fIyTi4uLj4+PnICHn5+jq6urs6+zs7Ozu7u7w8PDw8PHx8fHx8fLy8fLy8vLzHR329vb29vf39/j4+Pj5+fn6Hh76Hx/7+/v7+/z8Hx/8/Pz8/P39Hh79/f3///+f+BszAAAAcXRSTlMAAAECAwQFBwoPFhskJSYqKy4yMzU4OTw/Q0hRW1xjZGVmb294e3+Fi4+QkZibnaWmqq+2t7m+x8nKzM3Oz9HR19fd3d/h4eLk5ebm5+rq7O7v8PDy8vP09fX19/f3+Pn5+fr6/Pz8/f3+/v7+/v7+/k5HHiYAAAGUSURBVHgBY2BkFHMMizAVYmRk5NLSVAJSUg5uwYHOlmIMjFzq+soMbHrZ3WsWNyfJ8Gh7pOTxMjJKW6fd/v79S6IFn4FXciUvg3HNoqXNk5Y3ZcXXLSrVBRooW3Dvw/lTr75nZM7Yvd6dgcF37YqGxTOrayZsubkgkpOBkd3v7MddLX2zL7cef3srSoWBIWh1z6yL2zo2XH9wpRLIZeSKu3Bj4uGj03tOv/+60IaBgSG0cWrnypldO5+8nubPDLSBI6GwpGje5KoDn3/uCxAEKvBctH9Oe+/GOy83lykyABUw+aw7sbV/yt4XPx83aTEAgXzxwSeX7t78ca3DDiTPyKBQsePd/YfPP71f5crGAAJGOduP3X3/aHW6AEQBg1ru3DM/fn47kioHFACpMHSy3/PsULc5SB6sQtI2Ov/pm2UeDEAREGLRsPK+uilaAqoApEku/NzJWHGQAASLurd1m4CYcBUuS+abQW0E8xXLQ4RBTLgS1foYfpgCEClSqwFiIYBIqzZEACrMrceKqoBbhxmqAAABho1+nW2udAAAAABJRU5ErkJggg==);
}
#sidebar #portaldetails h3.title{
	width:auto;
}
`).appendTo('head');
	};

	window.plugin.pogo.setupContent = function () {

		plugin.pogo.htmlDisabledMessage = '<div title="Your browser do not support localStorage">Plugin PoGo disabled*.</div>';
		plugin.pogo.htmlStar = '<a class="pogoStar" accesskey="p" onclick="window.plugin.pogo.switchStarPortal(\'pokestop\');return false;" title="Mark this portal as a pokestop [p]"><span></span></a><a class="pogoGym" accesskey="g" onclick="window.plugin.pogo.switchStarPortal(\'gym\');return false;" title="Mark this portal as a PokeGym [g]"><span></span></a>';
		plugin.pogo.htmlCallSetBox = '<a onclick="window.plugin.pogo.manualOpt();return false;">PoGo Opt</a>';

		var actions = '';
		actions += '<a onclick="window.plugin.pogo.optReset();return false;" title="Deletes all Pokemon Go markers">Reset PoGo portals</a>';
		actions += '<a onclick="window.plugin.pogo.optCopy();return false;" title="Get data of all Pokemon Go markers">Copy PoGo portals</a>';
		actions += '<a onclick="window.plugin.pogo.optPaste();return false;" title="Add Pokemon Go markers to the map">Paste PoGo portals</a>';

		if (plugin.pogo.isAndroid()) {
			actions += '<a onclick="window.plugin.pogo.optImport();return false;">Import pogo</a>';
			actions += '<a onclick="window.plugin.pogo.optExport();return false;">Export pogo</a>';
		}

		plugin.pogo.htmlSetbox = '<div id="pogoSetbox">' + actions + '</div>';
	};

	/***************************************************************************************************************************************************************/

	var setup = function () {

		window.plugin.pogo.isSmart = window.isSmartphone();

		// Fired when a pogo/folder is removed, added or sorted, also when a folder is opened/closed.
		if ($.inArray('pluginpogoEdit', window.VALID_HOOKS) < 0) { window.VALID_HOOKS.push('pluginpogoEdit'); }
		// If the storage not exists or is a old version
		window.plugin.pogo.createStorage();

		// Load data from localStorage
		window.plugin.pogo.loadStorage();
		window.plugin.pogo.setupContent();
		window.plugin.pogo.setupCSS();

		$('#toolbox').append(window.plugin.pogo.htmlCallSetBox);

		window.addHook('portalSelected', window.plugin.pogo.onPortalSelected);

		// Layer - pokemon go portals
		window.plugin.pogo.stopLayerGroup = new L.LayerGroup();
		window.addLayerGroup('Pokestops', window.plugin.pogo.stopLayerGroup, true);
		window.plugin.pogo.gymLayerGroup = new L.LayerGroup();
		window.addLayerGroup('Gyms', window.plugin.pogo.gymLayerGroup, true);
		window.plugin.pogo.addAllStars();
		window.addHook('pluginpogoEdit', window.plugin.pogo.editStar);

		window.plugin.pogo.pogoTypes = {
			'gym': 'id1461999480084',
			'pokestop': 'id1461999480079',
			'none': 'id1462324832172'
		};

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
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
	info.script = {
		version: GM_info.script.version,
		name: GM_info.script.name,
		description: GM_info.script.description
	};
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
