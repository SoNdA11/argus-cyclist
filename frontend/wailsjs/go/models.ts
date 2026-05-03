export namespace domain {
	
	export class WorkoutSegment {
	    index: number;
	    type: string;
	    duration: number;
	    start_factor: number;
	    end_factor: number;
	    text: string;
	    free_ride: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WorkoutSegment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.type = source["type"];
	        this.duration = source["duration"];
	        this.start_factor = source["start_factor"];
	        this.end_factor = source["end_factor"];
	        this.text = source["text"];
	        this.free_ride = source["free_ride"];
	    }
	}
	export class ZWOStep {
	    duration?: number;
	    power?: number;
	    power_low?: number;
	    power_high?: number;
	    repeat?: number;
	    on_duration?: number;
	    on_power?: number;
	    off_duration?: number;
	    off_power?: number;
	    cadence?: number;
	
	    static createFrom(source: any = {}) {
	        return new ZWOStep(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.duration = source["duration"];
	        this.power = source["power"];
	        this.power_low = source["power_low"];
	        this.power_high = source["power_high"];
	        this.repeat = source["repeat"];
	        this.on_duration = source["on_duration"];
	        this.on_power = source["on_power"];
	        this.off_duration = source["off_duration"];
	        this.off_power = source["off_power"];
	        this.cadence = source["cadence"];
	    }
	}
	export class ZWOWorkout {
	    steps: ZWOStep[];
	
	    static createFrom(source: any = {}) {
	        return new ZWOWorkout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.steps = this.convertValues(source["steps"], ZWOStep);
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
	export class ZWOFile {
	    name: string;
	    description: string;
	    author: string;
	    workout: ZWOWorkout;
	
	    static createFrom(source: any = {}) {
	        return new ZWOFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.author = source["author"];
	        this.workout = this.convertValues(source["workout"], ZWOWorkout);
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
	export class ActiveWorkout {
	    metadata: ZWOFile;
	    segments: WorkoutSegment[];
	    total_duration: number;
	    is_test: boolean;
	    test_type: string;
	
	    static createFrom(source: any = {}) {
	        return new ActiveWorkout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.metadata = this.convertValues(source["metadata"], ZWOFile);
	        this.segments = this.convertValues(source["segments"], WorkoutSegment);
	        this.total_duration = source["total_duration"];
	        this.is_test = source["is_test"];
	        this.test_type = source["test_type"];
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
	    trimp: number;
	    aerobic_decoupling: number;
	    avg_hr: number;
	    max_hr: number;
	    intensity_factor: number;
	    elevation_gain: number;
	    // Go type: time
	    created_at: any;
	    time_in_hr_zones: Record<string, number>;
	    uploaded_to_strava: boolean;
	    peak_hr: number;
	    hrr_1: number;
	    hrr_2: number;
	
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
	        this.trimp = source["trimp"];
	        this.aerobic_decoupling = source["aerobic_decoupling"];
	        this.avg_hr = source["avg_hr"];
	        this.max_hr = source["max_hr"];
	        this.intensity_factor = source["intensity_factor"];
	        this.elevation_gain = source["elevation_gain"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.time_in_hr_zones = source["time_in_hr_zones"];
	        this.uploaded_to_strava = source["uploaded_to_strava"];
	        this.peak_hr = source["peak_hr"];
	        this.hrr_1 = source["hrr_1"];
	        this.hrr_2 = source["hrr_2"];
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
	export class EventRecord {
	    id: number;
	    rider_name: string;
	    event_mode: string;
	    score: number;
	    status: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new EventRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.rider_name = source["rider_name"];
	        this.event_mode = source["event_mode"];
	        this.score = source["score"];
	        this.status = source["status"];
	        this.created_at = this.convertValues(source["created_at"], null);
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
	    total_elevation: number;
	
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
	        this.total_elevation = source["total_elevation"];
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
	    resting_hr: number;
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
	        this.resting_hr = source["resting_hr"];
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
	
	export class DecouplingRecord {
	    date: string;
	    decoupling: number;
	
	    static createFrom(source: any = {}) {
	        return new DecouplingRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.decoupling = source["decoupling"];
	    }
	}
	export class CareerDashboard {
	    pmc: fit.PMCDay[];
	    decoupling: DecouplingRecord[];
	
	    static createFrom(source: any = {}) {
	        return new CareerDashboard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pmc = this.convertValues(source["pmc"], fit.PMCDay);
	        this.decoupling = this.convertValues(source["decoupling"], DecouplingRecord);
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
	    new_ftp: number;
	    new_max_hr: number;
	
	    static createFrom(source: any = {}) {
	        return new SessionSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activity = this.convertValues(source["activity"], domain.Activity);
	        this.zones = this.convertValues(source["zones"], fit.TimeInZones);
	        this.new_ftp = source["new_ftp"];
	        this.new_max_hr = source["new_max_hr"];
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

export namespace xml {
	
	export class Name {
	    Space: string;
	    Local: string;
	
	    static createFrom(source: any = {}) {
	        return new Name(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Space = source["Space"];
	        this.Local = source["Local"];
	    }
	}

}

