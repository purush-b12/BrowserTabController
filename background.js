
const GLOBAL_BOOKMARK_TREE = 'GLOBAL_BOOKMARK_TREE';
const OPEN_WINDOW_TABS_LIST_MAP = 'OPEN_WINDOW_TABS_LIST_MAP';
var bookmar_tree = null;
var windows_tab_map = null;

// Set alarm for clearing duplicate tabs
chrome.alarms.get('DuplicatTabCheckPeriodic', (alarm) => {

    if(!alarm){
        //every 24 hours checks for duplicate tabs and closes it
        //chrome.alarms.create('DuplicatTabCheckPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 24 });
        chrome.alarms.create('DuplicatTabCheckPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 });
    }
})

// Set alarm for handling long living tabs, for closing tabs and adding to bookmarks
chrome.alarms.get('LongStayingTabCheckPeriodic', (alarm) => {

    if(!alarm){
        //Every 5 days it checks for long staying tabs, moves it to bookmarks with easy accessible option and closes the tab
        //chrome.alarms.create('LongStayingTabCheckPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 24 * 5 });
        chrome.alarms.create('LongStayingTabCheckPeriodic', { delayInMinutes: 2.0, periodInMinutes: 2.0});

    }
})

/*chrome.alarms.get('UpdateCacheBookmarTreePeriodic', (alarm) => {

    if(!alarm){
        //Every 12 hours it checks bookmar folder and clears
        // try to use onTabCreates + updated
        chrome.alarms.create('UpdateCacheBookmarTreePeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 12 });
    }
})*/


// Alarm listener common for all alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
    var initPromiseList = [];

    if(alarm.name == 'DuplicatTabCheckPeriodic'){
        await closeDuplicateTabs();

    }else if(alarm.name == 'LongStayingTabCheckPeriodic'){
        
        await closeDuplicateTabs();

        // Getting bookmars and window + tabs data from Local storage
        initPromiseList.push(getFromLocalStorage(GLOBAL_BOOKMARK_TREE));
        initPromiseList.push(getFromLocalStorage(OPEN_WINDOW_TABS_LIST_MAP));
        await Promise.all(initPromiseList);

        checkAndUpdateBookmarsFolder();

    }else if(alarm.name == 'UpdateCacheBookmarTreePeriodic'){

    }
});

//check if it is first time extension opens, if not compare current open list of tabs 
//and with lab list & time - update bookmark folder
async function checkAndUpdateBookmarsFolder(){

    // if windows to tab map is null
    if(!windows_tab_map || Object.keys(windows_tab_map).length == 0){
        //create list of all tabs and windows, update local storage first time
        chrome.windows.getAll((windows) => {
            windows.forEach(window => {
                var tab_time_map = {};
                chrome.tabs.query({windowId: window.id}, (result) => {
                    result.forEach(tab => {
                        //tab_time_map[tab.id] = (new Date()).getDate();
                        tab_time_map[tab.id] = (new Date()).getTime();
                        
                    });

                });

                windows_tab_map[window.id] = tab_time_map;
            });
        })
        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
       
    }else {

        // if window from map is not open currently then remove entire id{} from map
        var currenOpenWindowIds = [];

        chrome.windows.getAll((windows) => {
            windows.forEach(window => {
                currenOpenWindowIds.push(window.id);
            });
        });

        Object.keys(windows_tab_map).forEach(windowId => {
            if(!currenOpenWindowIds.includes(windowId)){
                delete windows_tab_map[windowId];
            }
        })

        // update window_tab map and filter out the tab list to move to bookmark folder
        var addToBookMarkList = {};

        chrome.windows.getAll((windows) => {
            windows.forEach(window => {
                currenOpenWindowIds.push(window.id);
                
                // if window is already present in map
                // Add new tabs to already present window map
                if(windows_tab_map.includes(window.id)){
                    var wtm = windows_tab_map[window.id];
                    chrome.tabs.query({windowId: window.id}, (result) => {
                        result.forEach(tab => {
                            if(!wtm.includes(tab.id)){
                                //wtm[tab.id] = (new Date()).getDate();
                                wtm[tab.id] = (new Date()).getTime();
                            }
                        });
                    });
                    
                    windows_tab_map[window.id] = wtm;

                }else{
                    //if window id is already not present in map
                    var tab_time_map = {};
                    chrome.tabs.query({windowId: window.id}, (result) => {
                        result.forEach(tab => {
                            //tab_time_map[tab.id] = (new Date()).getDate();
                            tab_time_map[tab.id] = (new Date()).getTime();
                            
                        });
                    });
                    
                    windows_tab_map[window.id] = tab_time_map;
                }

                // add to bookmark adding list
                if(windows_tab_map.includes(window.id)){
                    var wtm = windows_tab_map[window.id];
                    var bmMoveTablist = [];
                    chrome.tabs.query({windowId: window.id}, (result) => {
                        result.forEach(tab => {
                            if(wtm.includes(tab.id)){
                                /*if(wtm[tab.id] <= ((new Date()).getDate() - 5)){
                                    bmMoveTablist.push(tab);
                                    delete wtm[tab.id];
                                }*/
                                if(((new Date()).getTime() - wtm[tab.id] > 2 * 60 * 1000)){
                                    bmMoveTablist.push(tab);
                                    delete wtm[tab.id];
                                }
                            }
                        });
                    });
                    
                    //if window is getting empty remove window from map
                    if(Object.keys(wtm).length == 0){
                        delete windows_tab_map[window.id];
                    }else{
                        windows_tab_map[window.id] = wtm;
                    }

                    addToBookMarkList[window.id] = bmMoveTablist;
                    
                }

            });

        })

        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);

        //move tabs to bookmark and close tabs, add to local bookmark folder map
        if(addToBookMarkList.length > 0){
            if(Object.keys(bookmar_tree.bookmarkChildrens).length > 0){
                var childerWindowIds = [];
                var promiseList = [];
                for(var key in bookmar_tree.bookmarkChildrens){
                    childerWindowIds.push(bookmar_tree.bookmarkChildrens[key].windowId);
                }
    
                for(var key in addToBookMarkList){
                    if(key in childerWindowIds){
                        //todo
    
                    }else{
                        var childernfolderName = 'Window' + (Object.keys(bookmar_tree.bookmarkChildrens).length + 1).toString();
                        bookmar_tree.bookmarkChildrens[childernfolderName] = {
                            windowId: key,
                            urlList: []
                        }
                        addToBookMarkList[key].forEach(tab => {
                            bookmar_tree.bookmarkChildrens[childernfolderName].urlList.push(tab.url);
                            //chrome.tabs.remove(tab.id);
                        })
                        promiseList.push(createBookmarkBarFolder(childernfolderName, bookmar_tree.bookmarkFolderId, bookmar_tree.bookmarkChildrens[childernfolderName].urlList));
                    }
                }
    
                await Promise.all(promiseList);
    
            }else{
                var promiseList = [];
                
                for(var key in addToBookMarkList){
                    var childernfolderName = 'Window' + (Object.keys(bookmar_tree.bookmarkChildrens).length + 1).toString();
                    bookmar_tree.bookmarkChildrens[childernfolderName] = {
                        windowId: key,
                        childrenId: null,
                        urlList: []
                    }
                    addToBookMarkList[key].forEach(tab => {
                        bookmar_tree.bookmarkChildrens[childernfolderName].urlList.push(tab.url);
                        //chrome.tabs.remove(tab.id);
                    })
                    promiseList.push(createChildrenBookmarkFolder(childernfolderName, bookmar_tree.bookmarkFolderId, 
                        bookmar_tree.bookmarkChildrens[childernfolderName].urlList));
                }
    
                await Promise.all(promiseList);
                
            }
        }
        
        setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
        
    }
}

async function createChildrenBookmarkFolder(folderName, parentId, urlList){
    return new Promise(async (resolve) => {
        chrome.bookmarks.create( {'parentId': parentId.toString(), 'title': folderName },
            async function(newFolder) {
                bookmar_tree.bookmarkChildrens[folderName]['childrenId'] = newFolder.id;
                var promiseList = [];
                urlList.forEach(url => {
                    promiseList.push(createChildrenBookmarks(url, newFolder.id));
                });
                await Promise.all(promiseList);
                setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
                resolve();
            },
        );
    });
    
}

async function createChildrenBookmarks(url, parentId){
    return new Promise(async (resolve) =>{
        chrome.bookmarks.create(
            {'parentId': parentId, 'url': url, 'title': url},
            function(n) {
                //console.log("success");
                resolve();
            },
        );
    });
}

//create bookmarks for all long staying tabs and close
function createBookmarkBarFolder(){
    try{
        chrome.bookmarks.create(
            {'parentId': '1', 'title': 'TabAssitant', 'index': 0},
            function(newFolder) {
              console.log("added folder: " + newFolder.title);    
                bookmar_tree = {
                    bookmarkFolderId: newFolder.id,
                    bookmarkChildrens: {}
                }
                console.log(bookmar_tree);
                setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
            },
        );
    }catch(err){
        console.log(err);
    }

}

//checking if created bookmark folder still exists or create new
function checkForBookmarkFolderAvailable(){
    var bmFolderId = bookmar_tree.bookmarkFolderId;
    chrome.bookmarks.getChildren(bmFolderId, (results) => {
        if(results.length == 0){
            createBookmarkBarFolder();
        }else {
            // todo bookmark folder index to 0
        }

    })

}

//get from local storage
async function getFromLocalStorage(storageKey){

    return new Promise(async (resolve) =>{
        chrome.storage.local.get([storageKey]).then((result) => {
            if(storageKey == GLOBAL_BOOKMARK_TREE){
                if(Object.keys(result).length > 0){
                    bookmar_tree = result.GLOBAL_BOOKMARK_TREE; 
                }else{
                    bookmar_tree = result; 
                }

                if(!bookmar_tree || Object.keys(bookmar_tree).length == 0){
                    createBookmarkBarFolder();
                }else{
                    checkForBookmarkFolderAvailable();
                }

                resolve();
               
            }else if(storageKey == OPEN_WINDOW_TABS_LIST_MAP){
                if(Object.keys(result).length > 0){
                    windows_tab_map = result.OPEN_WINDOW_TABS_LIST_MAP; 
                }else{
                    windows_tab_map = result; 
                }
                //if(!windows_tab_map){
                //    windows_tab_map = {}
                //}
                resolve();
            }
        })
    });
    
}

//set to local storage
function setToLocalStorage(storageKey, value){
    chrome.storage.local.set({[storageKey]: value }).then(() => {
        console.log("Setting value to storage success");
    });
}

// Add: tab create listener - update windows tab map in local storage
chrome.tabs.onCreated.addListener( (tab) => {
    updateWindowTabMap(tab.windowId, tab.id);

})

//  Add: tab update listener - update windows tab map in local storage
chrome.tabs.onUpdated.addListener( (tabId, changeInfo, tab) => {
    updateWindowTabMap(tab.windowId, tab.id);

})

//updating tab time details in window map LS
async function updateWindowTabMap(windowId, tabId){
    await getFromLocalStorage(OPEN_WINDOW_TABS_LIST_MAP);
    if(windows_tab_map && windows_tab_map[windowId]){
        var wtp = windows_tab_map[windowId];
        //wtp[tabId] = (new Date()).getDate();
        wtp[tabId] = (new Date()).getTime();
        windows_tab_map[windowId] = wtp;

        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
    }

}


// Add: manual tab close listener - remove from window tab map Local storage list 
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    await getFromLocalStorage(OPEN_WINDOW_TABS_LIST_MAP);

    if(windows_tab_map && windows_tab_map[removeInfo.windowId]){
        var wtp = windows_tab_map[removeInfo.windowId];
        delete wtp[tabId];
        windows_tab_map[removeInfo.windowId] = wtp;

        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
    }

});

//Add: on window removed listener - remove from window tab map LS list
chrome.windows.onRemoved.addListener(async (windowId) => {
    await getFromLocalStorage(OPEN_WINDOW_TABS_LIST_MAP);

    if(windows_tab_map && windows_tab_map[windowId]){
        delete windows_tab_map[windowId];
        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
    }

});

// ------todo ------- Add: on window created listener - add to window tab map LS list


// -----todo ------- Add: Tab opening from bookmark - remove from bookmark folder on browser + local storage
    // -----todo ------- Add: check if bookmark child folder is empty, delete child folder from browser bookmark + local storagechrome.tabs.onRemoved.addListener(


function closeDuplicateTabs(){

    return new Promise(async (resolve) =>{

        // remove duplicate tabs for all windows
        chrome.windows.getAll((windows) => {
            windows.forEach(window => {
                chrome.tabs.query({ windowId: window.id }, (tabs) => {
                    var urlSet = {};
                    for (let i = 0; i < tabs.length; i++) {
                        if (tabs[i].url) {
                            var openURL = tabs[i].url.toString();
                            if(urlSet[openURL] && urlSet[openURL] == true){
                                chrome.tabs.remove(tabs[i].id, function() {});
                            }else{
                                urlSet[openURL] = true;
                            }
                            
                        }
                    }
                
                    urlSet = {};
                    
                });
        
            });

            resolve();
        });
        
        
    });
    
}