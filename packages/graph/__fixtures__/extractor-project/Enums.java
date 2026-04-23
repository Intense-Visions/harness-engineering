public enum OrderStatus {
    PENDING,
    CONFIRMED,
    SHIPPED,
    DELIVERED,
    CANCELLED
}

public enum Priority {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

public enum PaymentMethod {
    CREDIT_CARD("credit_card"),
    DEBIT_CARD("debit_card"),
    PAYPAL("paypal"),
    BANK_TRANSFER("bank_transfer");

    private final String value;

    PaymentMethod(String value) {
        this.value = value;
    }
}
