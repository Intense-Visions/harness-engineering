package validators

type User struct {
	Email    string `json:"email" validate:"required,email"`
	Name     string `json:"name" validate:"required,min=1,max=255"`
	Age      int    `json:"age" validate:"gte=0,lte=150"`
	Password string `json:"password" validate:"required,min=8"`
}

type Order struct {
	Amount   float64 `json:"amount" validate:"required,gt=0,lte=1000000"`
	Currency string  `json:"currency" validate:"required,oneof=USD EUR GBP"`
	Items    []string `json:"items" validate:"required,min=1"`
}

type Address struct {
	Street  string `json:"street" validate:"required,min=1"`
	City    string `json:"city" validate:"required,min=1"`
	ZipCode string `json:"zip_code" validate:"required"`
	Country string `json:"country" validate:"required,len=2"`
}
