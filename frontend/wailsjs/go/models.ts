export namespace domain {
	
	export class Activity {
	    id: number;
	    route_name: string;
	    filename: string;
	    total_distance: number;
	    total_elevation: number;
	    avg_power: number;
	    avg_speed: number;
	    duration: number;
	    calories: number;
	    normalized_power: number;
	    tss: number;
	    intensity_factor: number;
	    elevation_gain: number;
	    // Go type: time
	    created_at: any;
	    time_in_hr_zones: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new Activity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.route_name = source["route_name"];
	        this.filename = source["filename"];
	        this.total_distance = source["total_distance"];
	        this.total_elevation = source["total_elevation"];
	        this.avg_power = source["avg_power"];
	        this.avg_speed = source["avg_speed"];
	        this.duration = source["duration"];
	        this.calories = source["calories"];
	        this.normalized_power = source["normalized_power"];
	        this.tss = source["tss"];
	        this.intensity_factor = source["intensity_factor"];
	        this.elevation_gain = source["elevation_gain"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.time_in_hr_zones = source["time_in_hr_zones"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BLEDevice {
	    name: string;
	    address: string;
	
	    static createFrom(source: any = {}) {
	        return new BLEDevice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.address = source["address"];
	    }
	}
	export class RoutePoint {
	    lat: number;
	    lon: number;
	    elevation: number;
	    distance: number;
	    grade: number;
	
	    static createFrom(source: any = {}) {
	        return new RoutePoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lat = source["lat"];
	        this.lon = source["lon"];
	        this.elevation = source["elevation"];
	        this.distance = source["distance"];
	        this.grade = source["grade"];
	    }
	}
	export class UserProfile {
	    id: number;
	    name: string;
	    photo: string;
	    weight: number;
	    bike_weight: number;
	    ftp: number;
	    max_hr: number;
	    theme: string;
	    units: string;
	    lthr: number;
	    level: number;
	    current_xp: number;
	    total_coins: number;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	    strava_access_token: string;
	    strava_refresh_token: string;
	    strava_expires_at: number;
	
	    static createFrom(source: any = {}) {
	        return new UserProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.photo = source["photo"];
	        this.weight = source["weight"];
	        this.bike_weight = source["bike_weight"];
	        this.ftp = source["ftp"];
	        this.max_hr = source["max_hr"];
	        this.theme = source["theme"];
	        this.units = source["units"];
	        this.lthr = source["lthr"];
	        this.level = source["level"];
	        this.current_xp = source["current_xp"];
	        this.total_coins = source["total_coins"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	        this.strava_access_token = source["strava_access_token"];
	        this.strava_refresh_token = source["strava_refresh_token"];
	        this.strava_expires_at = source["strava_expires_at"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace fit {
	
	export class ActivityDetails {
	    time: string[];
	    power: number[];
	    hr: number[];
	    cadence: number[];
	    distance: number[];
	    elevation: number[];
	
	    static createFrom(source: any = {}) {
	        return new ActivityDetails(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.power = source["power"];
	        this.hr = source["hr"];
	        this.cadence = source["cadence"];
	        this.distance = source["distance"];
	        this.elevation = source["elevation"];
	    }
	}
	export class PMCDay {
	    date: string;
	    tss: number;
	    ctl: number;
	    atl: number;
	    tsb: number;
	
	    static createFrom(source: any = {}) {
	        return new PMCDay(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.tss = source["tss"];
	        this.ctl = source["ctl"];
	        this.atl = source["atl"];
	        this.tsb = source["tsb"];
	    }
	}
	export class TimeInZones {
	    z1_time: number;
	    z2_time: number;
	    z3_time: number;
	    z4_time: number;
	    z5_time: number;
	    z6_time: number;
	
	    static createFrom(source: any = {}) {
	        return new TimeInZones(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.z1_time = source["z1_time"];
	        this.z2_time = source["z2_time"];
	        this.z3_time = source["z3_time"];
	        this.z4_time = source["z4_time"];
	        this.z5_time = source["z5_time"];
	        this.z6_time = source["z6_time"];
	    }
	}

}

export namespace main {
	
	export class CareerDashboard {
	    pmc: fit.PMCDay[];
	    mmp: storage.PowerRecord[];
	
	    static createFrom(source: any = {}) {
	        return new CareerDashboard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pmc = this.convertValues(source["pmc"], fit.PMCDay);
	        this.mmp = this.convertValues(source["mmp"], storage.PowerRecord);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExportPoint {
	    lat: number;
	    lon: number;
	    ele: number;
	
	    static createFrom(source: any = {}) {
	        return new ExportPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lat = source["lat"];
	        this.lon = source["lon"];
	        this.ele = source["ele"];
	    }
	}
	export class SessionSummary {
	    activity: domain.Activity;
	    zones: fit.TimeInZones;
	
	    static createFrom(source: any = {}) {
	        return new SessionSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activity = this.convertValues(source["activity"], domain.Activity);
	        this.zones = this.convertValues(source["zones"], fit.TimeInZones);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace storage {
	
	export class PowerRecord {
	    duration: number;
	    watts: number;
	    wkg: number;
	    // Go type: time
	    date: any;
	
	    static createFrom(source: any = {}) {
	        return new PowerRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.duration = source["duration"];
	        this.watts = source["watts"];
	        this.wkg = source["wkg"];
	        this.date = this.convertValues(source["date"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileSummary {
	    id: string;
	    name: string;
	    avatar: string;
	    level: number;
	    total_km: number;
	    total_time: number;
	
	    static createFrom(source: any = {}) {
	        return new ProfileSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.avatar = source["avatar"];
	        this.level = source["level"];
	        this.total_km = source["total_km"];
	        this.total_time = source["total_time"];
	    }
	}

}

