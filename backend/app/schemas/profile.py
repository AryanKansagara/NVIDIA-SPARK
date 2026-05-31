from pydantic import BaseModel


class ProfileIn(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    monthly_income: float | None = None


class ProfileOut(ProfileIn):
    pass


class SavedReportSummary(BaseModel):
    report_id: str
    address: str | None = None
    list_price: float | None = None
    buyer_profile: str | None = None
    true_10y_cost: int | None = None
    created_at: str


class SaveReportResponse(BaseModel):
    report_id: str
