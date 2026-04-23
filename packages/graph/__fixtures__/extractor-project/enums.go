package enums

type OrderStatus int

const (
	Pending OrderStatus = iota
	Confirmed
	Shipped
	Delivered
	Cancelled
)

type Priority int

const (
	Low Priority = iota
	Medium
	High
	Critical
)

type PaymentMethod string

const (
	CreditCard   PaymentMethod = "credit_card"
	DebitCard     PaymentMethod = "debit_card"
	PayPal        PaymentMethod = "paypal"
	BankTransfer  PaymentMethod = "bank_transfer"
)
