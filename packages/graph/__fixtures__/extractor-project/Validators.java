import javax.validation.constraints.*;

public class User {
    @NotNull
    @Email
    private String email;

    @NotNull
    @Size(min = 1, max = 255)
    private String name;

    @Min(0)
    @Max(150)
    private int age;

    @NotNull
    @Size(min = 8)
    private String password;
}

public class Order {
    @NotNull
    @DecimalMin("0.01")
    @DecimalMax("1000000")
    private BigDecimal amount;

    @NotNull
    @Pattern(regexp = "^(USD|EUR|GBP)$")
    private String currency;

    @NotNull
    @Size(min = 1)
    private List<String> items;
}

public class Address {
    @NotNull
    @Size(min = 1)
    private String street;

    @NotNull
    @Size(min = 1)
    private String city;

    @NotNull
    @Pattern(regexp = "^\\d{5}(-\\d{4})?$")
    private String zipCode;

    @NotNull
    @Size(min = 2, max = 2)
    private String country;
}
