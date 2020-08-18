function restore() {
    let auth = JSON.parse(localStorage.getItem('auth'));
    app.username = auth.username;
    app.password = auth.password;
    app.accountId = auth.accountId;
}

function make_jmap_query(x) {
    return {
        "using": [ "urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail" ],
        "methodCalls": x
    }
}

async function get_mailbox_id(accountId) {
    let mbox_query = make_jmap_query([[ "Mailbox/get", {
        "accountId": accountId,
        "ids": null
    }, "0" ]]);
    let data = await (await fetch('https://jmap.fastmail.com/api/', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Basic " + authBasic()
        },
        body: JSON.stringify(mbox_query)
    })).json();
    for (mailbox of data.methodResponses[0][1]['list']) {
        if (mailbox.name === "Reply Later") {
            return mailbox.id;
        }
    }
}

async function emails_query(accountId) {

    let mailbox_id = await get_mailbox_id(app.accountId);
    return [[ "Email/query", {
        "accountId": accountId,
        // todo: actually do the reply later thing
        "filter": { "inMailbox": mailbox_id },
        "sort": [{ "property": "receivedAt", "isAscending": false }],
        "collapseThreads": true,
        "position": 0,
        "limit": 20,
        "calculateTotal": true
    }, "t0" ],
        [ "Email/get", {
            "accountId": accountId,
            "#ids": {
                "resultOf": "t0",
                "name": "Email/query",
                "path": "/ids"
            },
            "properties": [ "threadId" ]
        }, "t1" ],
        [ "Thread/get", {
            "accountId": accountId,
            "#ids": {
                "resultOf": "t1",
                "name": "Email/get",
                "path": "/list/*/threadId"
            }
        }, "t2" ],
        [ "Email/get", {
            "accountId": accountId,
            "fetchTextBodyValues": true,
            "#ids": {
                "resultOf": "t2",
                "name": "Thread/get",
                "path": "/list/*/emailIds"
            },
            "properties": [ "from", "receivedAt", "subject", "bodyValues", "threadId"]
        }, "t3" ]]
}

function groupEmails(emails) {
    let threads = emails.reduce((groups, item) => ({
        ...groups,
        [item.threadId]: [...(groups[item.threadId] || []), item]
    }), {});

    let ret = [];
    for (id in threads) {
        let thread = threads[id];
        let last = thread[thread.length - 1];
        ret.push(last);
    }
    return ret;
}

function authBasic() {

    return window.btoa(app.username + ':' + app.password);
}

async function get_emails() {
    localStorage.setItem('auth', JSON.stringify({
        username: app.username,
        password: app.password,
        accountId: app.accountId
    }));
    let query = make_jmap_query(await emails_query(app.accountId));

    let data = await (await fetch('https://jmap.fastmail.com/api/', {
        url: 'https://jmap.fastmail.com/api/',
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Basic " + authBasic()
        },
        body: JSON.stringify(query)
    })).json();
    if (data.methodResponses[0][0] === 'error') {
        return
    }
    app.loggedIn = true;
    let emails = data['methodResponses'][3][1]['list'];
    app.emails = groupEmails(emails);
}

var app = new Vue({
    el: '#app',
    data: {
        message: 'Hello Vue!',
        username: null,
        password: null,
        accountId: null,
        loggedIn: false,
        emails: []
    },
    methods: {
        login: get_emails,
        logout: function() {
            app.username = null;
            app.password = null;
            app.accountId = null;
            app.loggedIn = false;
            localStorage.clear();
        },
        fix_email: function(email) {
            return Object.values(email.bodyValues)[0].value.replaceAll('\n', '<br>');
        },
    }
})
restore();
function saveTextAreas() {
    let drafts = {};
    for (x of document.querySelectorAll('textarea')) {
        if (x.value) {
            drafts[x.id] = x.value;
        }
    }
    if (Object.keys(drafts).length > 0) {
        localStorage.setItem('drafts', JSON.stringify(drafts));
    }
}
function loadTextAreas() {
    let drafts = JSON.parse(localStorage.getItem('drafts') || '{}');
    for (x of document.querySelectorAll('textarea')) {
        let saved = drafts[x.id];
        if (saved) {
            x.value = saved;
        }
    }
}
setInterval(saveTextAreas, 1000);

if(app.username && app.password && app.accountId) {
    get_emails().then(() => {
        loadTextAreas();
    });
}
