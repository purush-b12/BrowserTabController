const DEBUG_MODE = false;
const GLOBAL_BOOKMARK_TREE = 'GLOBAL_BOOKMARK_TREE';
const OPEN_WINDOW_TABS_LIST_MAP = 'OPEN_WINDOW_TABS_LIST_MAP';
var bookmar_tree = null;
var windows_tab_map = null;
var mainBookmarkCreatePromise = null;

mainBookmarkCreatePromise = getFromLocalStorage(GLOBAL_BOOKMARK_TREE);

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
        //Every 7 days it checks for long staying tabs, moves it to bookmarks with easy accessible option and closes the tab
        //chrome.alarms.create('LongStayingTabCheckPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 24 * 7 });
        chrome.alarms.create('LongStayingTabCheckPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0});

    }
})


// Alarm listener common for all alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {

    try{

        if(mainBookmarkCreatePromise){
            await mainBookmarkCreatePromise;
        }

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
    
        }
    }catch(err){
        if(DEBUG_MODE){
            console.log(err);
        }
    }
    
});

//check if it is first time extension opens, if not compare current open list of tabs 
//and with lab list & time - update bookmark folder
async function checkAndUpdateBookmarsFolder(){

    try{
        // if windows to tab map is null
        if(!windows_tab_map || Object.keys(windows_tab_map).length == 0){
            //create list of all tabs and windows, update local storage first time
            var lwindows = await chrome.windows.getAll();
            
            lwindows.forEach(async (window) => {
                var tab_time_map = {};

                var ltabs = await chrome.tabs.query({windowId: window.id});
                ltabs.forEach(tab => {
                    if(tab.url.toString() !== 'chrome://newtab/' || tab.url.toString() !== ''){
                        //tab_time_map[tab.id] = (new Date()).getDate();
                        tab_time_map[tab.id] = (new Date()).getTime();
                    }
                    
                });

                windows_tab_map[window.id] = tab_time_map;
                setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
            });
        
        }else {

            // if window from map is not open currently then remove entire id{} from map
            var currenOpenWindowIds = [];

            var lwindows = await chrome.windows.getAll();
            
            lwindows.forEach(window => {
                currenOpenWindowIds.push(window.id.toString());
            });
            
            Object.keys(windows_tab_map).forEach(windowId => {
                windowId = windowId.toString();
                if(!currenOpenWindowIds.includes(windowId)){
                    delete windows_tab_map[windowId];
                }
            })

            // update window_tab map and filter out the tab list to move to bookmark folder
            var addToBookMarkList = {};
            var windowCompletedCount = 0;

            
            lwindows.forEach(async (window) => {
                //currenOpenWindowIds.push(window.id);
                
                // if window is already present in map
                // Add new tabs to already present window map
                if(windows_tab_map[window.id]){
                    var wtm = windows_tab_map[window.id];

                    var ltabs = await chrome.tabs.query({windowId: window.id});
                    ltabs.forEach(tab => {
                        if(!wtm[tab.id]){
                            if(tab.url.toString() !== 'chrome://newtab/' || tab.url.toString() !== ''){
                                //wtm[tab.id] = (new Date()).getDate();
                                wtm[tab.id] = (new Date()).getTime();
                            }
                            
                        }
                    });
                    
                    windows_tab_map[window.id] = wtm;

                }else{
                    //if window id is already not present in map
                    var tab_time_map = {};

                    var ltabs = await chrome.tabs.query({windowId: window.id});
                    ltabs.forEach(tab => {
                        if(tab.url.toString() !== 'chrome://newtab/' || tab.url.toString() !== ''){
                            //tab_time_map[tab.id] = (new Date()).getDate();
                            tab_time_map[tab.id] = (new Date()).getTime();
                        }
                        
                    });
                    
                    windows_tab_map[window.id] = tab_time_map;
                }

                // add to bookmark adding list
                if(windows_tab_map[window.id]){
                    var wtm = windows_tab_map[window.id];
                    var bmMoveTablist = [];

                    var ltabs = await chrome.tabs.query({windowId: window.id});
                    ltabs.forEach(tab => {
                        if(wtm[tab.id]){
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
                    
                    
                    //if window is getting empty remove window from map
                    if(Object.keys(wtm).length == 0){
                        delete windows_tab_map[window.id];
                    }else{
                        windows_tab_map[window.id] = wtm;
                    }

                    if(bmMoveTablist.length > 0){
                        addToBookMarkList[window.id] = bmMoveTablist;
                    }
                    
                }

                setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);

                windowCompletedCount += 1;
                if(lwindows.length == windowCompletedCount){
                    //move tabs to bookmark and close tabs, add to local bookmark folder map
                    moveTabsToBookmark(addToBookMarkList);
                }

            });
            
        }
    }catch(error){
        if(DEBUG_MODE){
            console.log(error);
        }
    }
    
}

async function moveTabsToBookmark(addToBookMarkList){
    try{
        if(Object.keys(addToBookMarkList).length > 0){
            var lastFocusedWindow = await chrome.windows.getLastFocused();

            if(Object.keys(bookmar_tree.bookmarkChildrens).length > 0){
                var childerWindowIds = [];
                var promiseList = [];
                for(var key in bookmar_tree.bookmarkChildrens){
                    childerWindowIds.push(bookmar_tree.bookmarkChildrens[key].windowId);
                }

                for(var key in addToBookMarkList){
                    if(childerWindowIds.includes(key.toString())){
                        
                        for(var childernName in bookmar_tree.bookmarkChildrens){
                            if(bookmar_tree.bookmarkChildrens[childernName].windowId === key.toString()){
                                addToBookMarkList[key].forEach(tab => {
                                    if(!bookmar_tree.bookmarkChildrens[childernName].urlList.includes(tab.url)){
                                        bookmar_tree.bookmarkChildrens[childernName].urlList.push(tab.url);
                                        promiseList.push(createChildrenBookmarks(tab.url, bookmar_tree.bookmarkChildrens[childernName].childrenId));
                                        
                                        if(!tab.active || lastFocusedWindow.id != tab.windowId){
                                            chrome.tabs.remove(tab.id);
                                        }
                                    }
                                    
                                });
    
                            }
                        }
    
    
                    }else{
                        var bmChildrenLength = Object.keys(bookmar_tree.bookmarkChildrens).length;
                        var childernfolderName = '';
                        var startCount = 0;
                        while(true){
                            startCount += 1;
                            var tempName = 'Window' + startCount.toString();
                            if(!bookmar_tree.bookmarkChildrens[tempName] && startCount <= bmChildrenLength + 1){
                                childernfolderName = tempName;
                                break;
                            }
                        }
    
                        //var childernfolderName = 'Window' + (Object.keys(bookmar_tree.bookmarkChildrens).length + 1).toString();
                        bookmar_tree.bookmarkChildrens[childernfolderName] = {
                            windowId: key,
                            childrenId: null,
                            urlList: []
                        }
                        addToBookMarkList[key].forEach(tab => {
                            bookmar_tree.bookmarkChildrens[childernfolderName].urlList.push(tab.url);
                            if(!tab.active || lastFocusedWindow.id != tab.windowId){
                                chrome.tabs.remove(tab.id);
                            }
                        })
                        promiseList.push(createChildrenBookmarkFolder(childernfolderName, bookmar_tree.bookmarkFolderId, 
                            bookmar_tree.bookmarkChildrens[childernfolderName].urlList));
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
                        if(!tab.active || lastFocusedWindow.id != tab.windowId){
                            chrome.tabs.remove(tab.id);
                        }
                    })
                    promiseList.push(createChildrenBookmarkFolder(childernfolderName, bookmar_tree.bookmarkFolderId, 
                        bookmar_tree.bookmarkChildrens[childernfolderName].urlList));
                }
    
                await Promise.all(promiseList);
                
            }
    
            setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
        }
    }catch(error){
        if(DEBUG_MODE){
            console.log(error);
        }
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
                resolve();
            },
        );
    });
}

//create bookmarks for all long staying tabs and close
async function createBookmarkBarFolder(){
    return new Promise(async (resolve) =>{
        try{
            chrome.bookmarks.create({'parentId': '1', 'title': 'TabAssitant', 'index': 0},
                function(newFolder) {
                       
                    bookmar_tree = {
                        bookmarkFolderId: newFolder.id,
                        bookmarkChildrens: {}
                    }
                    if(DEBUG_MODE){
                        console.log("added folder: " + newFolder.title); 
                        console.log(bookmar_tree);
                    }
                    
                    setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
                    resolve();
                },
            );
        }catch(err){
            if(DEBUG_MODE){
                console.log(err);
            }
            resolve();
        }

    });
    

}

//checking if created bookmark folder still exists or create new
async function checkForBookmarkFolderAvailable(){
    return new Promise(async (resolve) =>{
        try{
            var bmFolderId = bookmar_tree.bookmarkFolderId;
            chrome.bookmarks.get(bmFolderId, async (results) => {
                if (chrome.runtime.lastError) {
                    if(DEBUG_MODE){
                        console.log(chrome.runtime.lastError.toString());
                    }
                }
                if(!results || results.length == 0){
                   await createBookmarkBarFolder();
                   resolve();
                }else {
                    // bookmark folder index to 0
                    if(results[0].index != 0){
                        chrome.bookmarks.move(
                            bmFolderId,
                            {'parentId': '1', 'index': 0},
                            (result) => {},
                        )
                    }
                    resolve();
                    
                }
        
            });
        }catch(err){
            if(DEBUG_MODE){
                console.log(err);
            }
            resolve();
        }

    });
    

}

//get from local storage
async function getFromLocalStorage(storageKey){

    return new Promise(async (resolve) =>{
        chrome.storage.local.get([storageKey]).then(async (result) => {
            if(storageKey == GLOBAL_BOOKMARK_TREE){
                if(Object.keys(result).length > 0){
                    bookmar_tree = result.GLOBAL_BOOKMARK_TREE; 
                }else{
                    bookmar_tree = result; 
                }

                if(!bookmar_tree || Object.keys(bookmar_tree).length == 0){
                    await createBookmarkBarFolder();
                }else{
                    await checkForBookmarkFolderAvailable();
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
        if(DEBUG_MODE){
            console.log("Setting value to storage success");
        }
        
    });
}

// Add: tab create listener - update windows tab map in local storage
chrome.tabs.onCreated.addListener(async (tab) => {

    try{
        if(mainBookmarkCreatePromise){
            await mainBookmarkCreatePromise;
        }
        if(tab.url.toString() !== 'chrome://newtab/' || tab.url.toString() !== ''){
            updateWindowTabMap(tab.windowId, tab.id);
            // remove it from bookmarks if present
            removeCreatedTabFromBookmarks(tab.id, tab.url);
        }
    }catch(err){
        if(DEBUG_MODE){
            console.log(err);
        }
    }

})

//  Add: tab update listener - update windows tab map in local storage
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {

    try{
        if(mainBookmarkCreatePromise){
            await mainBookmarkCreatePromise;
        }
        if(tab.url.toString() !== 'chrome://newtab/' || tab.url.toString() !== ''){
            updateWindowTabMap(tab.windowId, tab.id);
            // remove it from bookmarks if present
            removeCreatedTabFromBookmarks(tab.id, tab.url);
        }
        
    }catch(err){
        if(DEBUG_MODE){
            console.log(err);
        }
    }

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
    }else {
        // in case of new window created it enters here
        var wtp = {};
        //wtp[tabId] = (new Date()).getDate();
        wtp[tabId] = (new Date()).getTime();
        windows_tab_map[windowId] = wtp;

        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
    }

}


// Add: manual tab close listener - remove from window tab map Local storage list 
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    try{
        if(mainBookmarkCreatePromise){
            await mainBookmarkCreatePromise;
        }

        await getFromLocalStorage(OPEN_WINDOW_TABS_LIST_MAP);

        if(windows_tab_map && windows_tab_map[removeInfo.windowId]){
            var wtp = windows_tab_map[removeInfo.windowId];
            delete wtp[tabId];
            windows_tab_map[removeInfo.windowId] = wtp;
    
            setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
        }
    }catch(err){
        if(DEBUG_MODE){
            console.log(err);
        }
    }

});

//Add: on window removed listener - remove from window tab map LS list
chrome.windows.onRemoved.addListener(async (windowId) => {
    try{
        if(mainBookmarkCreatePromise){
            await mainBookmarkCreatePromise;
        }
        await getFromLocalStorage(OPEN_WINDOW_TABS_LIST_MAP);

        if(windows_tab_map && windows_tab_map[windowId]){
            delete windows_tab_map[windowId];
            setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
        }
    }catch(err){
        if(DEBUG_MODE){
            console.log(err);
        }
    }

});

// Add: Tab opening - remove from bookmark folder on browser + local storage bookmark tree
// Add: check if bookmark child folder is empty, delete child folder from browser bookmark + local storage

async function removeCreatedTabFromBookmarks(tabId, tabUrl){
    await getFromLocalStorage(GLOBAL_BOOKMARK_TREE);
    for(var childrenFolderName in bookmar_tree.bookmarkChildrens){
        if(bookmar_tree.bookmarkChildrens[childrenFolderName].urlList.includes(tabUrl)){
            bookmar_tree.bookmarkChildrens[childrenFolderName].urlList = arrayRemove(bookmar_tree.bookmarkChildrens[childrenFolderName].urlList, tabUrl);
            setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);

            var childrenId = bookmar_tree.bookmarkChildrens[childrenFolderName].childrenId;
            chrome.bookmarks.getChildren(childrenId, (results) => {
                results.forEach(treeNode => {
                    if(treeNode.url === tabUrl){
                        chrome.bookmarks.remove(
                            treeNode.id,
                            () =>{
                                chrome.bookmarks.getChildren(childrenId, (results) => {
                                    if(results.length == 0){
                                        chrome.bookmarks.remove(childrenId, ()=>{});
                                    }
                                });
                            }
                        )
                    }
                });
            })

            if(bookmar_tree.bookmarkChildrens[childrenFolderName].urlList.length == 0){
                delete bookmar_tree.bookmarkChildrens[childrenFolderName];
            }
            setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);

        }
    }

}

function arrayRemove(arr, value) { 
    
    return arr.filter(function(ele){ 
        return ele != value; 
    });
}


function closeDuplicateTabs(){

    return new Promise(async (resolve) =>{

        try{
            var lastFocusedWindow = await chrome.windows.getLastFocused();

            // remove duplicate tabs for all windows
            chrome.windows.getAll((windows) => {
                windows.forEach(window => {
                    chrome.tabs.query({ windowId: window.id }, (tabs) => {
                        var urlSet = {};
                        for (let i = 0; i < tabs.length; i++) {
                            if (tabs[i].url) {
                                var openURL = tabs[i].url.toString();
                                if((urlSet[openURL] && urlSet[openURL] == true) || openURL === 'chrome://newtab/' || openURL === ''){
                                    if(!tabs[i].active || lastFocusedWindow.id != tabs[i].windowId){
                                        chrome.tabs.remove(tabs[i].id, function() {});
                                    }
                                    
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

        }catch(err){
            if(DEBUG_MODE){
                console.log(err);
            }
        }       
        
        
    });
    
}