# PoGO Tools, PoGOHWH Edition

> This is a fork of the original [Pogo-Tools](https://gitlab.com/AlfonsoML/pogo-s2/) IITC Plugin, for [IITC-CE](https://iitc.modos189.ru/).
>
> The aim of this fork is to make this addon much faster by moving back to native Leaflet markers instead of custom SVGs inside div icons.
> The original addon grinds even the fastest of machines to a halt and is often unusuable on phones because of the overhead of these SVG icons.
> But with native Leaflet SVG circle markers, there are no noticable performance drops for hundreds and thousands of marked Pokéstops and Gyms.
>
> Install: https://raw.githubusercontent.com/PoGOHWH/iitc-ce-pogo-s2/pogohwh/s2check.user.js

This is script to that tries to help finding out info about Pokestops and Gyms in Pokemon Go. Is is a plugin for IITC to run in https://ingress.com/intel, you need an Ingress account and IITC already installed. I've published an additional page with an [overview of the features](https://gitlab.com/AlfonsoML/pogo-s2/wikis/How-to-add-new-PoI-to-your-city).

Check [this post](https://www.reddit.com/r/TheSilphRoad/comments/9fn61y/tutorial_pogo_s2_plugin_for_ingress_intel/) to learn how to install and configure it. I'm gonna write my own description below, just follow whatever steps you find easier.

A video in English: [How to install IITC-mobile and PogoTools](https://www.youtube.com/watch?v=PkxFcIdQ2gk)   
Video en Español sobre [como instalar IITC en Android](https://www.youtube.com/watch?v=WM4YHcVE9oU) y como [instalar y configuración inicial del PogoTools](https://www.youtube.com/watch?v=mH2vsqpT4Bc).  

## Pre-requisites
  1. An Ingress account. You don't have to play the game, just install it once and create and account, after you have everything configured you can un-install the game if you want to.
  2. Verify that you can login in https://intel.ingress.com
  3.
* For PC, install [Tampermonkey](https://tampermonkey.net/) on your browser of choice. Then install  [IITC-CE](https://iitc.modos189.ru/build/release/total-conversion-build.user.js) (old IITC also works, but it's no longer maintained)
* For Android install [IITC-CE](https://play.google.com/store/apps/details?id=org.exarhteam.iitc_mobile)
* For iOS install [IITC-Mobile](https://apps.apple.com/es/app/iitc-mobile/id1032695947)
4. Load again https://intel.ingress.com (or open the mobile app) and check that it works. You can enable the Google Satellite view to switch to a map easier to understand. You can also install and enable the "OpenStreetMap.org map tiles" plugin ([Destkop install](https://iitc.modos189.ru/build/release/plugins/basemap-openstreetmap.user.js), in Mobile they come pre-installed).
 
## Install
In desktop, 
<a href='https://gitlab.com/AlfonsoML/pogo-s2/raw/master/s2check.user.js?inline=false'>Click on this link</a>, now your browser should open a new tab with Tampermonkey asking for confirmation of the Install.   
<img src="https://gitlab.com/AlfonsoML/pogo-s2/raw/master/assets/tampermonkey_install.png">  
Click the Install button and load again the Ingress Intel page. 

If you are using IITCm on Android, then <a href='https://gitlab.com/AlfonsoML/pogo-s2/raw/master/s2check.user.js?inline=false'>Click on this link</a>, and you might be prompted to open in IITCm (accept it if you have this option), or the file might be downloaded automatically (as either s2check.user.js or s2check.txt). 
If the file has been downloaded, then open IITCm, go to Settings->Plugins and click the 3 dots menu to add a plugin and select the file that you have downloaded.   

Then you'll get the install prompt  
<img src="https://gitlab.com/AlfonsoML/pogo-s2/raw/master/assets/install_prompt.jpg">  
After successfully installing the plugin, it will be available under User Plugins->Layer and you have to enable it (click the checkbox)  
<img src="https://gitlab.com/AlfonsoML/pogo-s2/raw/master/assets/enable_plugin.jpg">  

In iOS you can install it by going to plugins, Add new one, then paste [this url](https://gitlab.com/AlfonsoML/pogo-s2/raw/master/s2check.user.js) then like in Android go to User Plugins->Layer and enable it.

## Features  
In IITC there are two links added to the side pane, one shows the actions available with the Pokemon data and the other allows you to change the settings of the plugin.
 
Settings dialog:
  1. Draw an overlay of two S2 cells levels (usually 14 and 17)
  2. Cover the level 17 cells where there is already a pokestop or gym, and if the L14 cell has already 3 gyms then it fills all of it with a dark color. In the center of the L14 cells will show the number of portals that must be added to that cell to get a new Gym. Also, draw a 20m circle around existing portals where no new portal will get approved. "Highlight Cells that might get a Gym" setting.
  3. Ability to check for updated data and suggest the addition of new Pokestops or Gyms when new Portals are detected, as well as movements or removals or portals. "Analyze portal data" setting
  4. Disable most of the features of Intel that aren't relevant to Pokemon (fields, links, portal ownership, chat...) with the "This is PoGo!" setting
  5. Configurable colors
  
Actions dialog
  1. Export all the portals and gyms data in JSON.
  2. Export the gyms and pokestops data as CSV to use it in any place where they expect that format (Overpass turbo, import to Google sheet for raid bots, ...)
  3. Reset all the data. In case something goes wrong (maybe incompatibility with another Pokemon Go plugin) test by clicking this option and reloading intel. If you have other IITC plugins for PoGo you should try to disable them if there are problems, this plugin includes everything that it's needed.  
  4. Import/Export the whole data for backups or to use in anothe device


Coloring of cells.  
When the Highlight cells that might get a Gym is selected, the L17 cells will be covered with a dark pattern, and L14 cells that have 3 gyms will be also darker so you can focus your efforts in other locations when requesting new portals.  
If a cell has enough portals but you have forgot to mark one of the stops as gyms the L14 cell will be marked as orange and in case that there are more gyms than expected then it will be red.
 
Adding Pokestops/Gyms  
When you select a portal, in the sidebar there will be two little icons of a pokeball and a gym so you can mark this portal as a Pokestop or Gym.  

**Analyze portal data**
If this setting is enabled, the plugin will try detect changes in the existing portals and so it will show some messages ("New pokestops X", "Review required X", "Moved portals X", ...) and clicking on those numbers will display a dialog trying to explain the detected changes. Hovering on the photos or locations will display a blinking marker on the map, clicking on them will center the map on them (and they might end up below the dialog, so move it afterwards to check the location)

## Updates
I'll try to publish announcements about changes and how to use the features in https://twitter.com/PogoCells so follow that account, it won't have too many posts and all of them focused on this plugin or very related things (but not news about Pokémon Go in general)

## Adding your candidates
If you want to add your candidates to the map to easily keep track of them, use the [Wayfarer Planner](https://gitlab.com/AlfonsoML/wayfarer/) plugin.
