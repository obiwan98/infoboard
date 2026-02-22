import Holidays from "date-holidays";
import { NextRequest, NextResponse } from "next/server";

type HolidayPayload = {
  date: string;
  name: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ message: "Invalid year or month" }, { status: 400 });
  }

  const hd = new Holidays("KR");
  const holidays = hd.getHolidays(year);

  const monthHolidays: HolidayPayload[] = holidays
    .filter((holiday) => {
      const holidayDate = new Date(holiday.date);
      return holidayDate.getMonth() + 1 === month;
    })
    .map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
    }));

  return NextResponse.json(monthHolidays);
}
