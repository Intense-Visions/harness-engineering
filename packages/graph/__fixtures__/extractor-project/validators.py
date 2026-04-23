from pydantic import BaseModel, Field, validator
from decimal import Decimal


class UserModel(BaseModel):
    email: str = Field(..., pattern=r'^[\w.-]+@[\w.-]+\.\w+$')
    name: str = Field(..., min_length=1, max_length=255)
    age: int = Field(..., ge=0, le=150)
    password: str = Field(..., min_length=8)


class OrderModel(BaseModel):
    amount: Decimal = Field(gt=0, le=1000000)
    currency: str = Field(..., pattern=r'^(USD|EUR|GBP)$')
    items: list[str] = Field(..., min_length=1)

    @validator('amount')
    def validate_amount_precision(cls, v):
        if v.as_tuple().exponent < -2:
            raise ValueError('Amount cannot have more than 2 decimal places')
        return v


class AddressModel(BaseModel):
    street: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1)
    zip_code: str = Field(..., pattern=r'^\d{5}(-\d{4})?$')
    country: str = Field(..., min_length=2, max_length=2)
