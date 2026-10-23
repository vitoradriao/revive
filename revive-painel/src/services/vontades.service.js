export const listUrgeEvents = (client, accountKey, filters) => client.urges('list', [filters], accountKey);
export const createUrgeEvent = (client, accountKey, payload, draft) => client.urges('create', [payload, draft], accountKey);
