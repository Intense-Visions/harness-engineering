pub enum OrderStatus {
    Pending,
    Confirmed,
    Shipped,
    Delivered,
    Cancelled,
}

pub enum Priority {
    Low,
    Medium,
    High,
    Critical,
}

pub enum PaymentMethod {
    CreditCard,
    DebitCard,
    PayPal,
    BankTransfer,
}

pub enum ShippingType {
    Standard(u32),
    Express(u32),
    Overnight,
}
