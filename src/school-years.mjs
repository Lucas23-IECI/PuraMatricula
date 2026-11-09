/* Shared limits for annual enrollment data, including historical records. */
export const MIN_SCHOOL_YEAR=1950;
export const MAX_SCHOOL_YEAR=2100;
export const schoolYearRange=Object.freeze({min:MIN_SCHOOL_YEAR,max:MAX_SCHOOL_YEAR});

export function parseSchoolYear(value){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^\d{4}$/.test(value.trim()))return null;
  const year=Number(value);
  return Number.isInteger(year)&&year>=MIN_SCHOOL_YEAR&&year<=MAX_SCHOOL_YEAR?year:null;
}
