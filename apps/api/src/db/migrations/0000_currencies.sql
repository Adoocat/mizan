CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"minor_units" smallint NOT NULL,
	"symbol" text NOT NULL,
	CONSTRAINT "currencies_code_format" CHECK ("currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_minor_units_range" CHECK ("currencies"."minor_units" BETWEEN 0 AND 4)
);
