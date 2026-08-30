const { DnsRecord, Subdomain } = require('../database/models');

class CloudflareApi {
	constructor() {
		this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
		this.zoneId = process.env.CLOUDFLARE_ZONE_ID;
		this.domainName = process.env.CLOUDFLARE_DOMAIN;
		this.baseUrl = this.zoneId ? `https://api.cloudflare.com/client/v4/zones/${this.zoneId}` : null;
	}

	isConfigured() {
		return Boolean(this.apiToken && this.zoneId && this.domainName);
	}

	async _request(endpoint, method = 'GET', body = null) {
		const url = `${this.baseUrl}${endpoint}`;
		const options = { method, headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' } };
		if (body) options.body = JSON.stringify(body);

		try {
			const response = await fetch(url, options);
			const data = await response.json();
			if (!data.success) {
				console.warn(`[pro/cloudflare] API error: ${data.errors?.[0]?.message}`);
				return { success: false, errors: data.errors };
			}
			return { success: true, result: data.result };
		} catch (error) {
			console.error(`[pro/cloudflare] request failed: ${method} ${endpoint}:`, error.message);
			return { success: false, errors: [{ message: error.message }] };
		}
	}

	async createRecord(subdomainId, subdomainName, { type, name, value, priority = 10 }) {
		const cloudflareName = name === '@' ? `${subdomainName}.${this.domainName}` : `${name}.${subdomainName}.${this.domainName}`;
		const apiBody = { type, name: cloudflareName, content: value, ttl: 1, proxied: false };
		if (type === 'MX') apiBody.priority = priority;

		const apiResponse = await this._request('/dns_records', 'POST', apiBody);
		if (!apiResponse.success) return { success: false, error: apiResponse.errors?.[0]?.message };

		try {
			const newDbRecord = await DnsRecord.create({ subdomainId, type, name, value, priority: type === 'MX' ? priority : null, cloudflareId: apiResponse.result.id });
			return { success: true, record: newDbRecord };
		} catch (dbError) {
			console.error(`[pro/cloudflare] API succeeded but DB save failed for subdomain ${subdomainId}:`, dbError.message);
			await this.deleteRecordByCloudflareId(apiResponse.result.id);
			return { success: false, error: 'Failed to save record to local database.' };
		}
	}

	async deleteRecord(localRecordId) {
		const record = await DnsRecord.findByPk(localRecordId);
		if (!record) return { success: false, error: 'Record not found in local database.' };

		const apiResponse = await this._request(`/dns_records/${record.cloudflareId}`, 'DELETE');
		if (!apiResponse.success && apiResponse.errors?.[0]?.code !== 81044) {
			return { success: false, error: apiResponse.errors?.[0]?.message };
		}

		await record.destroy();
		return { success: true };
	}

	async deleteRecordByCloudflareId(cloudflareId) {
		await this._request(`/dns_records/${cloudflareId}`, 'DELETE');
	}

	async updateRecord(existingRecord, { value, priority = 10 }) {
		const subdomain = await Subdomain.findByPk(existingRecord.subdomainId, { attributes: ['name'] });
		if (!subdomain) return { success: false, error: 'Subdomain associated with this record is missing.' };

		const cloudflareName = existingRecord.name === '@' ? `${subdomain.name}.${this.domainName}` : `${existingRecord.name}.${subdomain.name}.${this.domainName}`;
		const apiBody = { type: existingRecord.type, name: cloudflareName, content: value, ttl: 1, proxied: false };
		if (existingRecord.type === 'MX') apiBody.priority = priority;

		const apiResponse = await this._request(`/dns_records/${existingRecord.cloudflareId}`, 'PATCH', apiBody);
		if (!apiResponse.success) return { success: false, error: apiResponse.errors?.[0]?.message };

		try {
			existingRecord.value = value;
			if (existingRecord.type === 'MX') existingRecord.priority = priority;
			await existingRecord.save();
			return { success: true, record: existingRecord };
		} catch (dbError) {
			console.error(`[pro/cloudflare] API update succeeded but DB save failed for record ${existingRecord.id}:`, dbError.message);
			return { success: false, error: 'Cloudflare updated, but local DB failed to save.' };
		}
	}
}

module.exports = new CloudflareApi();
