SET statement_timeout = 0;
SET client_encoding = 'UTF8';
CREATE SCHEMA app;

CREATE TABLE app.table_0 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_0 IS 'tabella 0';

CREATE TABLE app.table_1 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_0_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_1 IS 'tabella 1';

CREATE TABLE app.table_2 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_1_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_2 IS 'tabella 2';

CREATE TABLE app.table_3 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_2_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_3 IS 'tabella 3';

CREATE TABLE app.table_4 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_3_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_4 IS 'tabella 4';

CREATE TABLE app.table_5 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_4_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_5 IS 'tabella 5';

CREATE TABLE app.table_6 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_5_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_6 IS 'tabella 6';

CREATE TABLE app.table_7 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_6_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_7 IS 'tabella 7';

CREATE TABLE app.table_8 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_7_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_8 IS 'tabella 8';

CREATE TABLE app.table_9 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_8_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_9 IS 'tabella 9';

CREATE TABLE app.table_10 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_9_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_10 IS 'tabella 10';

CREATE TABLE app.table_11 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_10_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_11 IS 'tabella 11';

CREATE TABLE app.table_12 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_11_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_12 IS 'tabella 12';

CREATE TABLE app.table_13 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_12_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_13 IS 'tabella 13';

CREATE TABLE app.table_14 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_13_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_14 IS 'tabella 14';

CREATE TABLE app.table_15 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_14_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_15 IS 'tabella 15';

CREATE TABLE app.table_16 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_15_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_16 IS 'tabella 16';

CREATE TABLE app.table_17 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_16_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_17 IS 'tabella 17';

CREATE TABLE app.table_18 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_17_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_18 IS 'tabella 18';

CREATE TABLE app.table_19 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_18_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_19 IS 'tabella 19';

CREATE TABLE app.table_20 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_19_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_20 IS 'tabella 20';

CREATE TABLE app.table_21 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_20_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_21 IS 'tabella 21';

CREATE TABLE app.table_22 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_21_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_22 IS 'tabella 22';

CREATE TABLE app.table_23 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_22_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_23 IS 'tabella 23';

CREATE TABLE app.table_24 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_23_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_24 IS 'tabella 24';

CREATE TABLE app.table_25 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_24_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_25 IS 'tabella 25';

CREATE TABLE app.table_26 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_25_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_26 IS 'tabella 26';

CREATE TABLE app.table_27 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_26_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_27 IS 'tabella 27';

CREATE TABLE app.table_28 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_27_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_28 IS 'tabella 28';

CREATE TABLE app.table_29 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_28_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_29 IS 'tabella 29';

CREATE TABLE app.table_30 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_29_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_30 IS 'tabella 30';

CREATE TABLE app.table_31 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_30_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_31 IS 'tabella 31';

CREATE TABLE app.table_32 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_31_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_32 IS 'tabella 32';

CREATE TABLE app.table_33 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_32_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_33 IS 'tabella 33';

CREATE TABLE app.table_34 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_33_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_34 IS 'tabella 34';

CREATE TABLE app.table_35 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_34_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_35 IS 'tabella 35';

CREATE TABLE app.table_36 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_35_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_36 IS 'tabella 36';

CREATE TABLE app.table_37 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_36_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_37 IS 'tabella 37';

CREATE TABLE app.table_38 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_37_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_38 IS 'tabella 38';

CREATE TABLE app.table_39 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_38_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_39 IS 'tabella 39';

CREATE TABLE app.table_40 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_39_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_40 IS 'tabella 40';

CREATE TABLE app.table_41 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_40_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_41 IS 'tabella 41';

CREATE TABLE app.table_42 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_41_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_42 IS 'tabella 42';

CREATE TABLE app.table_43 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_42_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_43 IS 'tabella 43';

CREATE TABLE app.table_44 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_43_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_44 IS 'tabella 44';

CREATE TABLE app.table_45 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_44_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_45 IS 'tabella 45';

CREATE TABLE app.table_46 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_45_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_46 IS 'tabella 46';

CREATE TABLE app.table_47 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_46_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_47 IS 'tabella 47';

CREATE TABLE app.table_48 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_47_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_48 IS 'tabella 48';

CREATE TABLE app.table_49 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_48_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_49 IS 'tabella 49';

CREATE TABLE app.table_50 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_49_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_50 IS 'tabella 50';

CREATE TABLE app.table_51 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_50_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_51 IS 'tabella 51';

CREATE TABLE app.table_52 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_51_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_52 IS 'tabella 52';

CREATE TABLE app.table_53 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_52_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_53 IS 'tabella 53';

CREATE TABLE app.table_54 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_53_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_54 IS 'tabella 54';

CREATE TABLE app.table_55 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_54_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_55 IS 'tabella 55';

CREATE TABLE app.table_56 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_55_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_56 IS 'tabella 56';

CREATE TABLE app.table_57 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_56_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_57 IS 'tabella 57';

CREATE TABLE app.table_58 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_57_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_58 IS 'tabella 58';

CREATE TABLE app.table_59 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_58_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_59 IS 'tabella 59';

CREATE TABLE app.table_60 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_59_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_60 IS 'tabella 60';

CREATE TABLE app.table_61 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_60_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_61 IS 'tabella 61';

CREATE TABLE app.table_62 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_61_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_62 IS 'tabella 62';

CREATE TABLE app.table_63 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_62_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_63 IS 'tabella 63';

CREATE TABLE app.table_64 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_63_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_64 IS 'tabella 64';

CREATE TABLE app.table_65 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_64_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_65 IS 'tabella 65';

CREATE TABLE app.table_66 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_65_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_66 IS 'tabella 66';

CREATE TABLE app.table_67 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_66_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_67 IS 'tabella 67';

CREATE TABLE app.table_68 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_67_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_68 IS 'tabella 68';

CREATE TABLE app.table_69 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_68_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_69 IS 'tabella 69';

CREATE TABLE app.table_70 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_69_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_70 IS 'tabella 70';

CREATE TABLE app.table_71 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_70_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_71 IS 'tabella 71';

CREATE TABLE app.table_72 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_71_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_72 IS 'tabella 72';

CREATE TABLE app.table_73 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_72_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_73 IS 'tabella 73';

CREATE TABLE app.table_74 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_73_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_74 IS 'tabella 74';

CREATE TABLE app.table_75 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_74_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_75 IS 'tabella 75';

CREATE TABLE app.table_76 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_75_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_76 IS 'tabella 76';

CREATE TABLE app.table_77 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_76_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_77 IS 'tabella 77';

CREATE TABLE app.table_78 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_77_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_78 IS 'tabella 78';

CREATE TABLE app.table_79 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_78_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_79 IS 'tabella 79';

CREATE TABLE app.table_80 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_79_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_80 IS 'tabella 80';

CREATE TABLE app.table_81 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_80_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_81 IS 'tabella 81';

CREATE TABLE app.table_82 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_81_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_82 IS 'tabella 82';

CREATE TABLE app.table_83 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_82_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_83 IS 'tabella 83';

CREATE TABLE app.table_84 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_83_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_84 IS 'tabella 84';

CREATE TABLE app.table_85 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_84_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_85 IS 'tabella 85';

CREATE TABLE app.table_86 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_85_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_86 IS 'tabella 86';

CREATE TABLE app.table_87 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_86_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_87 IS 'tabella 87';

CREATE TABLE app.table_88 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_87_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_88 IS 'tabella 88';

CREATE TABLE app.table_89 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_88_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_89 IS 'tabella 89';

CREATE TABLE app.table_90 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_89_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_90 IS 'tabella 90';

CREATE TABLE app.table_91 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_90_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_91 IS 'tabella 91';

CREATE TABLE app.table_92 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_91_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_92 IS 'tabella 92';

CREATE TABLE app.table_93 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_92_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_93 IS 'tabella 93';

CREATE TABLE app.table_94 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_93_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_94 IS 'tabella 94';

CREATE TABLE app.table_95 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_94_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_95 IS 'tabella 95';

CREATE TABLE app.table_96 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_95_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_96 IS 'tabella 96';

CREATE TABLE app.table_97 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_96_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_97 IS 'tabella 97';

CREATE TABLE app.table_98 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_97_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_98 IS 'tabella 98';

CREATE TABLE app.table_99 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_98_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_99 IS 'tabella 99';

CREATE TABLE app.table_100 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_99_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_100 IS 'tabella 100';

CREATE TABLE app.table_101 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_100_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_101 IS 'tabella 101';

CREATE TABLE app.table_102 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_101_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_102 IS 'tabella 102';

CREATE TABLE app.table_103 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_102_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_103 IS 'tabella 103';

CREATE TABLE app.table_104 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_103_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_104 IS 'tabella 104';

CREATE TABLE app.table_105 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_104_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_105 IS 'tabella 105';

CREATE TABLE app.table_106 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_105_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_106 IS 'tabella 106';

CREATE TABLE app.table_107 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_106_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_107 IS 'tabella 107';

CREATE TABLE app.table_108 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_107_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_108 IS 'tabella 108';

CREATE TABLE app.table_109 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_108_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_109 IS 'tabella 109';

CREATE TABLE app.table_110 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_109_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_110 IS 'tabella 110';

CREATE TABLE app.table_111 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_110_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_111 IS 'tabella 111';

CREATE TABLE app.table_112 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_111_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_112 IS 'tabella 112';

CREATE TABLE app.table_113 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_112_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_113 IS 'tabella 113';

CREATE TABLE app.table_114 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_113_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_114 IS 'tabella 114';

CREATE TABLE app.table_115 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_114_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_115 IS 'tabella 115';

CREATE TABLE app.table_116 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_115_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_116 IS 'tabella 116';

CREATE TABLE app.table_117 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_116_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_117 IS 'tabella 117';

CREATE TABLE app.table_118 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_117_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_118 IS 'tabella 118';

CREATE TABLE app.table_119 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_118_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_119 IS 'tabella 119';

CREATE TABLE app.table_120 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_119_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_120 IS 'tabella 120';

CREATE TABLE app.table_121 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_120_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_121 IS 'tabella 121';

CREATE TABLE app.table_122 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_121_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_122 IS 'tabella 122';

CREATE TABLE app.table_123 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_122_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_123 IS 'tabella 123';

CREATE TABLE app.table_124 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_123_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_124 IS 'tabella 124';

CREATE TABLE app.table_125 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_124_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_125 IS 'tabella 125';

CREATE TABLE app.table_126 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_125_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_126 IS 'tabella 126';

CREATE TABLE app.table_127 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_126_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_127 IS 'tabella 127';

CREATE TABLE app.table_128 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_127_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_128 IS 'tabella 128';

CREATE TABLE app.table_129 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_128_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_129 IS 'tabella 129';

CREATE TABLE app.table_130 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_129_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_130 IS 'tabella 130';

CREATE TABLE app.table_131 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_130_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_131 IS 'tabella 131';

CREATE TABLE app.table_132 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_131_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_132 IS 'tabella 132';

CREATE TABLE app.table_133 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_132_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_133 IS 'tabella 133';

CREATE TABLE app.table_134 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_133_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_134 IS 'tabella 134';

CREATE TABLE app.table_135 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_134_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_135 IS 'tabella 135';

CREATE TABLE app.table_136 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_135_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_136 IS 'tabella 136';

CREATE TABLE app.table_137 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_136_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_137 IS 'tabella 137';

CREATE TABLE app.table_138 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_137_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_138 IS 'tabella 138';

CREATE TABLE app.table_139 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_138_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_139 IS 'tabella 139';

CREATE TABLE app.table_140 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_139_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_140 IS 'tabella 140';

CREATE TABLE app.table_141 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_140_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_141 IS 'tabella 141';

CREATE TABLE app.table_142 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_141_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_142 IS 'tabella 142';

CREATE TABLE app.table_143 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_142_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_143 IS 'tabella 143';

CREATE TABLE app.table_144 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_143_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_144 IS 'tabella 144';

CREATE TABLE app.table_145 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_144_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_145 IS 'tabella 145';

CREATE TABLE app.table_146 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_145_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_146 IS 'tabella 146';

CREATE TABLE app.table_147 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_146_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_147 IS 'tabella 147';

CREATE TABLE app.table_148 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_147_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_148 IS 'tabella 148';

CREATE TABLE app.table_149 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_148_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_149 IS 'tabella 149';

CREATE TABLE app.table_150 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_149_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_150 IS 'tabella 150';

CREATE TABLE app.table_151 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_150_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_151 IS 'tabella 151';

CREATE TABLE app.table_152 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_151_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_152 IS 'tabella 152';

CREATE TABLE app.table_153 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_152_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_153 IS 'tabella 153';

CREATE TABLE app.table_154 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_153_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_154 IS 'tabella 154';

CREATE TABLE app.table_155 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_154_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_155 IS 'tabella 155';

CREATE TABLE app.table_156 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_155_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_156 IS 'tabella 156';

CREATE TABLE app.table_157 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_156_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_157 IS 'tabella 157';

CREATE TABLE app.table_158 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_157_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_158 IS 'tabella 158';

CREATE TABLE app.table_159 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_158_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_159 IS 'tabella 159';

CREATE TABLE app.table_160 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_159_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_160 IS 'tabella 160';

CREATE TABLE app.table_161 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_160_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_161 IS 'tabella 161';

CREATE TABLE app.table_162 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_161_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_162 IS 'tabella 162';

CREATE TABLE app.table_163 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_162_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_163 IS 'tabella 163';

CREATE TABLE app.table_164 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_163_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_164 IS 'tabella 164';

CREATE TABLE app.table_165 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_164_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_165 IS 'tabella 165';

CREATE TABLE app.table_166 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_165_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_166 IS 'tabella 166';

CREATE TABLE app.table_167 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_166_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_167 IS 'tabella 167';

CREATE TABLE app.table_168 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_167_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_168 IS 'tabella 168';

CREATE TABLE app.table_169 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_168_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_169 IS 'tabella 169';

CREATE TABLE app.table_170 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_169_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_170 IS 'tabella 170';

CREATE TABLE app.table_171 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_170_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_171 IS 'tabella 171';

CREATE TABLE app.table_172 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_171_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_172 IS 'tabella 172';

CREATE TABLE app.table_173 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_172_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_173 IS 'tabella 173';

CREATE TABLE app.table_174 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_173_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_174 IS 'tabella 174';

CREATE TABLE app.table_175 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_174_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_175 IS 'tabella 175';

CREATE TABLE app.table_176 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_175_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_176 IS 'tabella 176';

CREATE TABLE app.table_177 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_176_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_177 IS 'tabella 177';

CREATE TABLE app.table_178 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_177_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_178 IS 'tabella 178';

CREATE TABLE app.table_179 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_178_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_179 IS 'tabella 179';

CREATE TABLE app.table_180 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_179_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_180 IS 'tabella 180';

CREATE TABLE app.table_181 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_180_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_181 IS 'tabella 181';

CREATE TABLE app.table_182 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_181_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_182 IS 'tabella 182';

CREATE TABLE app.table_183 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_182_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_183 IS 'tabella 183';

CREATE TABLE app.table_184 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_183_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_184 IS 'tabella 184';

CREATE TABLE app.table_185 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_184_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_185 IS 'tabella 185';

CREATE TABLE app.table_186 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_185_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_186 IS 'tabella 186';

CREATE TABLE app.table_187 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_186_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_187 IS 'tabella 187';

CREATE TABLE app.table_188 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_187_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_188 IS 'tabella 188';

CREATE TABLE app.table_189 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_188_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_189 IS 'tabella 189';

CREATE TABLE app.table_190 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_189_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_190 IS 'tabella 190';

CREATE TABLE app.table_191 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_190_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_191 IS 'tabella 191';

CREATE TABLE app.table_192 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_191_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_192 IS 'tabella 192';

CREATE TABLE app.table_193 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_192_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_193 IS 'tabella 193';

CREATE TABLE app.table_194 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_193_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_194 IS 'tabella 194';

CREATE TABLE app.table_195 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_194_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_195 IS 'tabella 195';

CREATE TABLE app.table_196 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_195_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_196 IS 'tabella 196';

CREATE TABLE app.table_197 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_196_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_197 IS 'tabella 197';

CREATE TABLE app.table_198 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_197_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_198 IS 'tabella 198';

CREATE TABLE app.table_199 (
    id bigint NOT NULL,
    col_0 character varying(255) NOT NULL,
    col_1 character varying(255),
    col_2 character varying(255),
    col_3 character varying(255) NOT NULL,
    col_4 character varying(255),
    col_5 character varying(255),
    col_6 character varying(255) NOT NULL,
    col_7 character varying(255),
    col_8 character varying(255),
    col_9 character varying(255) NOT NULL,
    table_198_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE app.table_199 IS 'tabella 199';

ALTER TABLE ONLY app.table_0 ADD CONSTRAINT table_0_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_1 ADD CONSTRAINT table_1_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_1 ADD CONSTRAINT table_1_parent_fkey FOREIGN KEY (table_0_id) REFERENCES app.table_0(id);
ALTER TABLE ONLY app.table_2 ADD CONSTRAINT table_2_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_2 ADD CONSTRAINT table_2_parent_fkey FOREIGN KEY (table_1_id) REFERENCES app.table_1(id);
ALTER TABLE ONLY app.table_3 ADD CONSTRAINT table_3_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_3 ADD CONSTRAINT table_3_parent_fkey FOREIGN KEY (table_2_id) REFERENCES app.table_2(id);
ALTER TABLE ONLY app.table_4 ADD CONSTRAINT table_4_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_4 ADD CONSTRAINT table_4_parent_fkey FOREIGN KEY (table_3_id) REFERENCES app.table_3(id);
ALTER TABLE ONLY app.table_5 ADD CONSTRAINT table_5_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_5 ADD CONSTRAINT table_5_parent_fkey FOREIGN KEY (table_4_id) REFERENCES app.table_4(id);
ALTER TABLE ONLY app.table_6 ADD CONSTRAINT table_6_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_6 ADD CONSTRAINT table_6_parent_fkey FOREIGN KEY (table_5_id) REFERENCES app.table_5(id);
ALTER TABLE ONLY app.table_7 ADD CONSTRAINT table_7_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_7 ADD CONSTRAINT table_7_parent_fkey FOREIGN KEY (table_6_id) REFERENCES app.table_6(id);
ALTER TABLE ONLY app.table_8 ADD CONSTRAINT table_8_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_8 ADD CONSTRAINT table_8_parent_fkey FOREIGN KEY (table_7_id) REFERENCES app.table_7(id);
ALTER TABLE ONLY app.table_9 ADD CONSTRAINT table_9_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_9 ADD CONSTRAINT table_9_parent_fkey FOREIGN KEY (table_8_id) REFERENCES app.table_8(id);
ALTER TABLE ONLY app.table_10 ADD CONSTRAINT table_10_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_10 ADD CONSTRAINT table_10_parent_fkey FOREIGN KEY (table_9_id) REFERENCES app.table_9(id);
ALTER TABLE ONLY app.table_11 ADD CONSTRAINT table_11_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_11 ADD CONSTRAINT table_11_parent_fkey FOREIGN KEY (table_10_id) REFERENCES app.table_10(id);
ALTER TABLE ONLY app.table_12 ADD CONSTRAINT table_12_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_12 ADD CONSTRAINT table_12_parent_fkey FOREIGN KEY (table_11_id) REFERENCES app.table_11(id);
ALTER TABLE ONLY app.table_13 ADD CONSTRAINT table_13_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_13 ADD CONSTRAINT table_13_parent_fkey FOREIGN KEY (table_12_id) REFERENCES app.table_12(id);
ALTER TABLE ONLY app.table_14 ADD CONSTRAINT table_14_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_14 ADD CONSTRAINT table_14_parent_fkey FOREIGN KEY (table_13_id) REFERENCES app.table_13(id);
ALTER TABLE ONLY app.table_15 ADD CONSTRAINT table_15_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_15 ADD CONSTRAINT table_15_parent_fkey FOREIGN KEY (table_14_id) REFERENCES app.table_14(id);
ALTER TABLE ONLY app.table_16 ADD CONSTRAINT table_16_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_16 ADD CONSTRAINT table_16_parent_fkey FOREIGN KEY (table_15_id) REFERENCES app.table_15(id);
ALTER TABLE ONLY app.table_17 ADD CONSTRAINT table_17_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_17 ADD CONSTRAINT table_17_parent_fkey FOREIGN KEY (table_16_id) REFERENCES app.table_16(id);
ALTER TABLE ONLY app.table_18 ADD CONSTRAINT table_18_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_18 ADD CONSTRAINT table_18_parent_fkey FOREIGN KEY (table_17_id) REFERENCES app.table_17(id);
ALTER TABLE ONLY app.table_19 ADD CONSTRAINT table_19_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_19 ADD CONSTRAINT table_19_parent_fkey FOREIGN KEY (table_18_id) REFERENCES app.table_18(id);
ALTER TABLE ONLY app.table_20 ADD CONSTRAINT table_20_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_20 ADD CONSTRAINT table_20_parent_fkey FOREIGN KEY (table_19_id) REFERENCES app.table_19(id);
ALTER TABLE ONLY app.table_21 ADD CONSTRAINT table_21_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_21 ADD CONSTRAINT table_21_parent_fkey FOREIGN KEY (table_20_id) REFERENCES app.table_20(id);
ALTER TABLE ONLY app.table_22 ADD CONSTRAINT table_22_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_22 ADD CONSTRAINT table_22_parent_fkey FOREIGN KEY (table_21_id) REFERENCES app.table_21(id);
ALTER TABLE ONLY app.table_23 ADD CONSTRAINT table_23_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_23 ADD CONSTRAINT table_23_parent_fkey FOREIGN KEY (table_22_id) REFERENCES app.table_22(id);
ALTER TABLE ONLY app.table_24 ADD CONSTRAINT table_24_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_24 ADD CONSTRAINT table_24_parent_fkey FOREIGN KEY (table_23_id) REFERENCES app.table_23(id);
ALTER TABLE ONLY app.table_25 ADD CONSTRAINT table_25_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_25 ADD CONSTRAINT table_25_parent_fkey FOREIGN KEY (table_24_id) REFERENCES app.table_24(id);
ALTER TABLE ONLY app.table_26 ADD CONSTRAINT table_26_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_26 ADD CONSTRAINT table_26_parent_fkey FOREIGN KEY (table_25_id) REFERENCES app.table_25(id);
ALTER TABLE ONLY app.table_27 ADD CONSTRAINT table_27_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_27 ADD CONSTRAINT table_27_parent_fkey FOREIGN KEY (table_26_id) REFERENCES app.table_26(id);
ALTER TABLE ONLY app.table_28 ADD CONSTRAINT table_28_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_28 ADD CONSTRAINT table_28_parent_fkey FOREIGN KEY (table_27_id) REFERENCES app.table_27(id);
ALTER TABLE ONLY app.table_29 ADD CONSTRAINT table_29_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_29 ADD CONSTRAINT table_29_parent_fkey FOREIGN KEY (table_28_id) REFERENCES app.table_28(id);
ALTER TABLE ONLY app.table_30 ADD CONSTRAINT table_30_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_30 ADD CONSTRAINT table_30_parent_fkey FOREIGN KEY (table_29_id) REFERENCES app.table_29(id);
ALTER TABLE ONLY app.table_31 ADD CONSTRAINT table_31_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_31 ADD CONSTRAINT table_31_parent_fkey FOREIGN KEY (table_30_id) REFERENCES app.table_30(id);
ALTER TABLE ONLY app.table_32 ADD CONSTRAINT table_32_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_32 ADD CONSTRAINT table_32_parent_fkey FOREIGN KEY (table_31_id) REFERENCES app.table_31(id);
ALTER TABLE ONLY app.table_33 ADD CONSTRAINT table_33_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_33 ADD CONSTRAINT table_33_parent_fkey FOREIGN KEY (table_32_id) REFERENCES app.table_32(id);
ALTER TABLE ONLY app.table_34 ADD CONSTRAINT table_34_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_34 ADD CONSTRAINT table_34_parent_fkey FOREIGN KEY (table_33_id) REFERENCES app.table_33(id);
ALTER TABLE ONLY app.table_35 ADD CONSTRAINT table_35_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_35 ADD CONSTRAINT table_35_parent_fkey FOREIGN KEY (table_34_id) REFERENCES app.table_34(id);
ALTER TABLE ONLY app.table_36 ADD CONSTRAINT table_36_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_36 ADD CONSTRAINT table_36_parent_fkey FOREIGN KEY (table_35_id) REFERENCES app.table_35(id);
ALTER TABLE ONLY app.table_37 ADD CONSTRAINT table_37_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_37 ADD CONSTRAINT table_37_parent_fkey FOREIGN KEY (table_36_id) REFERENCES app.table_36(id);
ALTER TABLE ONLY app.table_38 ADD CONSTRAINT table_38_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_38 ADD CONSTRAINT table_38_parent_fkey FOREIGN KEY (table_37_id) REFERENCES app.table_37(id);
ALTER TABLE ONLY app.table_39 ADD CONSTRAINT table_39_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_39 ADD CONSTRAINT table_39_parent_fkey FOREIGN KEY (table_38_id) REFERENCES app.table_38(id);
ALTER TABLE ONLY app.table_40 ADD CONSTRAINT table_40_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_40 ADD CONSTRAINT table_40_parent_fkey FOREIGN KEY (table_39_id) REFERENCES app.table_39(id);
ALTER TABLE ONLY app.table_41 ADD CONSTRAINT table_41_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_41 ADD CONSTRAINT table_41_parent_fkey FOREIGN KEY (table_40_id) REFERENCES app.table_40(id);
ALTER TABLE ONLY app.table_42 ADD CONSTRAINT table_42_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_42 ADD CONSTRAINT table_42_parent_fkey FOREIGN KEY (table_41_id) REFERENCES app.table_41(id);
ALTER TABLE ONLY app.table_43 ADD CONSTRAINT table_43_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_43 ADD CONSTRAINT table_43_parent_fkey FOREIGN KEY (table_42_id) REFERENCES app.table_42(id);
ALTER TABLE ONLY app.table_44 ADD CONSTRAINT table_44_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_44 ADD CONSTRAINT table_44_parent_fkey FOREIGN KEY (table_43_id) REFERENCES app.table_43(id);
ALTER TABLE ONLY app.table_45 ADD CONSTRAINT table_45_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_45 ADD CONSTRAINT table_45_parent_fkey FOREIGN KEY (table_44_id) REFERENCES app.table_44(id);
ALTER TABLE ONLY app.table_46 ADD CONSTRAINT table_46_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_46 ADD CONSTRAINT table_46_parent_fkey FOREIGN KEY (table_45_id) REFERENCES app.table_45(id);
ALTER TABLE ONLY app.table_47 ADD CONSTRAINT table_47_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_47 ADD CONSTRAINT table_47_parent_fkey FOREIGN KEY (table_46_id) REFERENCES app.table_46(id);
ALTER TABLE ONLY app.table_48 ADD CONSTRAINT table_48_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_48 ADD CONSTRAINT table_48_parent_fkey FOREIGN KEY (table_47_id) REFERENCES app.table_47(id);
ALTER TABLE ONLY app.table_49 ADD CONSTRAINT table_49_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_49 ADD CONSTRAINT table_49_parent_fkey FOREIGN KEY (table_48_id) REFERENCES app.table_48(id);
ALTER TABLE ONLY app.table_50 ADD CONSTRAINT table_50_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_50 ADD CONSTRAINT table_50_parent_fkey FOREIGN KEY (table_49_id) REFERENCES app.table_49(id);
ALTER TABLE ONLY app.table_51 ADD CONSTRAINT table_51_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_51 ADD CONSTRAINT table_51_parent_fkey FOREIGN KEY (table_50_id) REFERENCES app.table_50(id);
ALTER TABLE ONLY app.table_52 ADD CONSTRAINT table_52_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_52 ADD CONSTRAINT table_52_parent_fkey FOREIGN KEY (table_51_id) REFERENCES app.table_51(id);
ALTER TABLE ONLY app.table_53 ADD CONSTRAINT table_53_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_53 ADD CONSTRAINT table_53_parent_fkey FOREIGN KEY (table_52_id) REFERENCES app.table_52(id);
ALTER TABLE ONLY app.table_54 ADD CONSTRAINT table_54_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_54 ADD CONSTRAINT table_54_parent_fkey FOREIGN KEY (table_53_id) REFERENCES app.table_53(id);
ALTER TABLE ONLY app.table_55 ADD CONSTRAINT table_55_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_55 ADD CONSTRAINT table_55_parent_fkey FOREIGN KEY (table_54_id) REFERENCES app.table_54(id);
ALTER TABLE ONLY app.table_56 ADD CONSTRAINT table_56_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_56 ADD CONSTRAINT table_56_parent_fkey FOREIGN KEY (table_55_id) REFERENCES app.table_55(id);
ALTER TABLE ONLY app.table_57 ADD CONSTRAINT table_57_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_57 ADD CONSTRAINT table_57_parent_fkey FOREIGN KEY (table_56_id) REFERENCES app.table_56(id);
ALTER TABLE ONLY app.table_58 ADD CONSTRAINT table_58_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_58 ADD CONSTRAINT table_58_parent_fkey FOREIGN KEY (table_57_id) REFERENCES app.table_57(id);
ALTER TABLE ONLY app.table_59 ADD CONSTRAINT table_59_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_59 ADD CONSTRAINT table_59_parent_fkey FOREIGN KEY (table_58_id) REFERENCES app.table_58(id);
ALTER TABLE ONLY app.table_60 ADD CONSTRAINT table_60_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_60 ADD CONSTRAINT table_60_parent_fkey FOREIGN KEY (table_59_id) REFERENCES app.table_59(id);
ALTER TABLE ONLY app.table_61 ADD CONSTRAINT table_61_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_61 ADD CONSTRAINT table_61_parent_fkey FOREIGN KEY (table_60_id) REFERENCES app.table_60(id);
ALTER TABLE ONLY app.table_62 ADD CONSTRAINT table_62_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_62 ADD CONSTRAINT table_62_parent_fkey FOREIGN KEY (table_61_id) REFERENCES app.table_61(id);
ALTER TABLE ONLY app.table_63 ADD CONSTRAINT table_63_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_63 ADD CONSTRAINT table_63_parent_fkey FOREIGN KEY (table_62_id) REFERENCES app.table_62(id);
ALTER TABLE ONLY app.table_64 ADD CONSTRAINT table_64_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_64 ADD CONSTRAINT table_64_parent_fkey FOREIGN KEY (table_63_id) REFERENCES app.table_63(id);
ALTER TABLE ONLY app.table_65 ADD CONSTRAINT table_65_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_65 ADD CONSTRAINT table_65_parent_fkey FOREIGN KEY (table_64_id) REFERENCES app.table_64(id);
ALTER TABLE ONLY app.table_66 ADD CONSTRAINT table_66_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_66 ADD CONSTRAINT table_66_parent_fkey FOREIGN KEY (table_65_id) REFERENCES app.table_65(id);
ALTER TABLE ONLY app.table_67 ADD CONSTRAINT table_67_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_67 ADD CONSTRAINT table_67_parent_fkey FOREIGN KEY (table_66_id) REFERENCES app.table_66(id);
ALTER TABLE ONLY app.table_68 ADD CONSTRAINT table_68_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_68 ADD CONSTRAINT table_68_parent_fkey FOREIGN KEY (table_67_id) REFERENCES app.table_67(id);
ALTER TABLE ONLY app.table_69 ADD CONSTRAINT table_69_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_69 ADD CONSTRAINT table_69_parent_fkey FOREIGN KEY (table_68_id) REFERENCES app.table_68(id);
ALTER TABLE ONLY app.table_70 ADD CONSTRAINT table_70_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_70 ADD CONSTRAINT table_70_parent_fkey FOREIGN KEY (table_69_id) REFERENCES app.table_69(id);
ALTER TABLE ONLY app.table_71 ADD CONSTRAINT table_71_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_71 ADD CONSTRAINT table_71_parent_fkey FOREIGN KEY (table_70_id) REFERENCES app.table_70(id);
ALTER TABLE ONLY app.table_72 ADD CONSTRAINT table_72_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_72 ADD CONSTRAINT table_72_parent_fkey FOREIGN KEY (table_71_id) REFERENCES app.table_71(id);
ALTER TABLE ONLY app.table_73 ADD CONSTRAINT table_73_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_73 ADD CONSTRAINT table_73_parent_fkey FOREIGN KEY (table_72_id) REFERENCES app.table_72(id);
ALTER TABLE ONLY app.table_74 ADD CONSTRAINT table_74_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_74 ADD CONSTRAINT table_74_parent_fkey FOREIGN KEY (table_73_id) REFERENCES app.table_73(id);
ALTER TABLE ONLY app.table_75 ADD CONSTRAINT table_75_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_75 ADD CONSTRAINT table_75_parent_fkey FOREIGN KEY (table_74_id) REFERENCES app.table_74(id);
ALTER TABLE ONLY app.table_76 ADD CONSTRAINT table_76_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_76 ADD CONSTRAINT table_76_parent_fkey FOREIGN KEY (table_75_id) REFERENCES app.table_75(id);
ALTER TABLE ONLY app.table_77 ADD CONSTRAINT table_77_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_77 ADD CONSTRAINT table_77_parent_fkey FOREIGN KEY (table_76_id) REFERENCES app.table_76(id);
ALTER TABLE ONLY app.table_78 ADD CONSTRAINT table_78_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_78 ADD CONSTRAINT table_78_parent_fkey FOREIGN KEY (table_77_id) REFERENCES app.table_77(id);
ALTER TABLE ONLY app.table_79 ADD CONSTRAINT table_79_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_79 ADD CONSTRAINT table_79_parent_fkey FOREIGN KEY (table_78_id) REFERENCES app.table_78(id);
ALTER TABLE ONLY app.table_80 ADD CONSTRAINT table_80_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_80 ADD CONSTRAINT table_80_parent_fkey FOREIGN KEY (table_79_id) REFERENCES app.table_79(id);
ALTER TABLE ONLY app.table_81 ADD CONSTRAINT table_81_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_81 ADD CONSTRAINT table_81_parent_fkey FOREIGN KEY (table_80_id) REFERENCES app.table_80(id);
ALTER TABLE ONLY app.table_82 ADD CONSTRAINT table_82_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_82 ADD CONSTRAINT table_82_parent_fkey FOREIGN KEY (table_81_id) REFERENCES app.table_81(id);
ALTER TABLE ONLY app.table_83 ADD CONSTRAINT table_83_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_83 ADD CONSTRAINT table_83_parent_fkey FOREIGN KEY (table_82_id) REFERENCES app.table_82(id);
ALTER TABLE ONLY app.table_84 ADD CONSTRAINT table_84_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_84 ADD CONSTRAINT table_84_parent_fkey FOREIGN KEY (table_83_id) REFERENCES app.table_83(id);
ALTER TABLE ONLY app.table_85 ADD CONSTRAINT table_85_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_85 ADD CONSTRAINT table_85_parent_fkey FOREIGN KEY (table_84_id) REFERENCES app.table_84(id);
ALTER TABLE ONLY app.table_86 ADD CONSTRAINT table_86_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_86 ADD CONSTRAINT table_86_parent_fkey FOREIGN KEY (table_85_id) REFERENCES app.table_85(id);
ALTER TABLE ONLY app.table_87 ADD CONSTRAINT table_87_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_87 ADD CONSTRAINT table_87_parent_fkey FOREIGN KEY (table_86_id) REFERENCES app.table_86(id);
ALTER TABLE ONLY app.table_88 ADD CONSTRAINT table_88_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_88 ADD CONSTRAINT table_88_parent_fkey FOREIGN KEY (table_87_id) REFERENCES app.table_87(id);
ALTER TABLE ONLY app.table_89 ADD CONSTRAINT table_89_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_89 ADD CONSTRAINT table_89_parent_fkey FOREIGN KEY (table_88_id) REFERENCES app.table_88(id);
ALTER TABLE ONLY app.table_90 ADD CONSTRAINT table_90_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_90 ADD CONSTRAINT table_90_parent_fkey FOREIGN KEY (table_89_id) REFERENCES app.table_89(id);
ALTER TABLE ONLY app.table_91 ADD CONSTRAINT table_91_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_91 ADD CONSTRAINT table_91_parent_fkey FOREIGN KEY (table_90_id) REFERENCES app.table_90(id);
ALTER TABLE ONLY app.table_92 ADD CONSTRAINT table_92_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_92 ADD CONSTRAINT table_92_parent_fkey FOREIGN KEY (table_91_id) REFERENCES app.table_91(id);
ALTER TABLE ONLY app.table_93 ADD CONSTRAINT table_93_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_93 ADD CONSTRAINT table_93_parent_fkey FOREIGN KEY (table_92_id) REFERENCES app.table_92(id);
ALTER TABLE ONLY app.table_94 ADD CONSTRAINT table_94_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_94 ADD CONSTRAINT table_94_parent_fkey FOREIGN KEY (table_93_id) REFERENCES app.table_93(id);
ALTER TABLE ONLY app.table_95 ADD CONSTRAINT table_95_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_95 ADD CONSTRAINT table_95_parent_fkey FOREIGN KEY (table_94_id) REFERENCES app.table_94(id);
ALTER TABLE ONLY app.table_96 ADD CONSTRAINT table_96_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_96 ADD CONSTRAINT table_96_parent_fkey FOREIGN KEY (table_95_id) REFERENCES app.table_95(id);
ALTER TABLE ONLY app.table_97 ADD CONSTRAINT table_97_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_97 ADD CONSTRAINT table_97_parent_fkey FOREIGN KEY (table_96_id) REFERENCES app.table_96(id);
ALTER TABLE ONLY app.table_98 ADD CONSTRAINT table_98_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_98 ADD CONSTRAINT table_98_parent_fkey FOREIGN KEY (table_97_id) REFERENCES app.table_97(id);
ALTER TABLE ONLY app.table_99 ADD CONSTRAINT table_99_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_99 ADD CONSTRAINT table_99_parent_fkey FOREIGN KEY (table_98_id) REFERENCES app.table_98(id);
ALTER TABLE ONLY app.table_100 ADD CONSTRAINT table_100_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_100 ADD CONSTRAINT table_100_parent_fkey FOREIGN KEY (table_99_id) REFERENCES app.table_99(id);
ALTER TABLE ONLY app.table_101 ADD CONSTRAINT table_101_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_101 ADD CONSTRAINT table_101_parent_fkey FOREIGN KEY (table_100_id) REFERENCES app.table_100(id);
ALTER TABLE ONLY app.table_102 ADD CONSTRAINT table_102_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_102 ADD CONSTRAINT table_102_parent_fkey FOREIGN KEY (table_101_id) REFERENCES app.table_101(id);
ALTER TABLE ONLY app.table_103 ADD CONSTRAINT table_103_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_103 ADD CONSTRAINT table_103_parent_fkey FOREIGN KEY (table_102_id) REFERENCES app.table_102(id);
ALTER TABLE ONLY app.table_104 ADD CONSTRAINT table_104_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_104 ADD CONSTRAINT table_104_parent_fkey FOREIGN KEY (table_103_id) REFERENCES app.table_103(id);
ALTER TABLE ONLY app.table_105 ADD CONSTRAINT table_105_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_105 ADD CONSTRAINT table_105_parent_fkey FOREIGN KEY (table_104_id) REFERENCES app.table_104(id);
ALTER TABLE ONLY app.table_106 ADD CONSTRAINT table_106_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_106 ADD CONSTRAINT table_106_parent_fkey FOREIGN KEY (table_105_id) REFERENCES app.table_105(id);
ALTER TABLE ONLY app.table_107 ADD CONSTRAINT table_107_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_107 ADD CONSTRAINT table_107_parent_fkey FOREIGN KEY (table_106_id) REFERENCES app.table_106(id);
ALTER TABLE ONLY app.table_108 ADD CONSTRAINT table_108_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_108 ADD CONSTRAINT table_108_parent_fkey FOREIGN KEY (table_107_id) REFERENCES app.table_107(id);
ALTER TABLE ONLY app.table_109 ADD CONSTRAINT table_109_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_109 ADD CONSTRAINT table_109_parent_fkey FOREIGN KEY (table_108_id) REFERENCES app.table_108(id);
ALTER TABLE ONLY app.table_110 ADD CONSTRAINT table_110_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_110 ADD CONSTRAINT table_110_parent_fkey FOREIGN KEY (table_109_id) REFERENCES app.table_109(id);
ALTER TABLE ONLY app.table_111 ADD CONSTRAINT table_111_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_111 ADD CONSTRAINT table_111_parent_fkey FOREIGN KEY (table_110_id) REFERENCES app.table_110(id);
ALTER TABLE ONLY app.table_112 ADD CONSTRAINT table_112_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_112 ADD CONSTRAINT table_112_parent_fkey FOREIGN KEY (table_111_id) REFERENCES app.table_111(id);
ALTER TABLE ONLY app.table_113 ADD CONSTRAINT table_113_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_113 ADD CONSTRAINT table_113_parent_fkey FOREIGN KEY (table_112_id) REFERENCES app.table_112(id);
ALTER TABLE ONLY app.table_114 ADD CONSTRAINT table_114_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_114 ADD CONSTRAINT table_114_parent_fkey FOREIGN KEY (table_113_id) REFERENCES app.table_113(id);
ALTER TABLE ONLY app.table_115 ADD CONSTRAINT table_115_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_115 ADD CONSTRAINT table_115_parent_fkey FOREIGN KEY (table_114_id) REFERENCES app.table_114(id);
ALTER TABLE ONLY app.table_116 ADD CONSTRAINT table_116_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_116 ADD CONSTRAINT table_116_parent_fkey FOREIGN KEY (table_115_id) REFERENCES app.table_115(id);
ALTER TABLE ONLY app.table_117 ADD CONSTRAINT table_117_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_117 ADD CONSTRAINT table_117_parent_fkey FOREIGN KEY (table_116_id) REFERENCES app.table_116(id);
ALTER TABLE ONLY app.table_118 ADD CONSTRAINT table_118_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_118 ADD CONSTRAINT table_118_parent_fkey FOREIGN KEY (table_117_id) REFERENCES app.table_117(id);
ALTER TABLE ONLY app.table_119 ADD CONSTRAINT table_119_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_119 ADD CONSTRAINT table_119_parent_fkey FOREIGN KEY (table_118_id) REFERENCES app.table_118(id);
ALTER TABLE ONLY app.table_120 ADD CONSTRAINT table_120_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_120 ADD CONSTRAINT table_120_parent_fkey FOREIGN KEY (table_119_id) REFERENCES app.table_119(id);
ALTER TABLE ONLY app.table_121 ADD CONSTRAINT table_121_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_121 ADD CONSTRAINT table_121_parent_fkey FOREIGN KEY (table_120_id) REFERENCES app.table_120(id);
ALTER TABLE ONLY app.table_122 ADD CONSTRAINT table_122_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_122 ADD CONSTRAINT table_122_parent_fkey FOREIGN KEY (table_121_id) REFERENCES app.table_121(id);
ALTER TABLE ONLY app.table_123 ADD CONSTRAINT table_123_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_123 ADD CONSTRAINT table_123_parent_fkey FOREIGN KEY (table_122_id) REFERENCES app.table_122(id);
ALTER TABLE ONLY app.table_124 ADD CONSTRAINT table_124_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_124 ADD CONSTRAINT table_124_parent_fkey FOREIGN KEY (table_123_id) REFERENCES app.table_123(id);
ALTER TABLE ONLY app.table_125 ADD CONSTRAINT table_125_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_125 ADD CONSTRAINT table_125_parent_fkey FOREIGN KEY (table_124_id) REFERENCES app.table_124(id);
ALTER TABLE ONLY app.table_126 ADD CONSTRAINT table_126_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_126 ADD CONSTRAINT table_126_parent_fkey FOREIGN KEY (table_125_id) REFERENCES app.table_125(id);
ALTER TABLE ONLY app.table_127 ADD CONSTRAINT table_127_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_127 ADD CONSTRAINT table_127_parent_fkey FOREIGN KEY (table_126_id) REFERENCES app.table_126(id);
ALTER TABLE ONLY app.table_128 ADD CONSTRAINT table_128_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_128 ADD CONSTRAINT table_128_parent_fkey FOREIGN KEY (table_127_id) REFERENCES app.table_127(id);
ALTER TABLE ONLY app.table_129 ADD CONSTRAINT table_129_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_129 ADD CONSTRAINT table_129_parent_fkey FOREIGN KEY (table_128_id) REFERENCES app.table_128(id);
ALTER TABLE ONLY app.table_130 ADD CONSTRAINT table_130_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_130 ADD CONSTRAINT table_130_parent_fkey FOREIGN KEY (table_129_id) REFERENCES app.table_129(id);
ALTER TABLE ONLY app.table_131 ADD CONSTRAINT table_131_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_131 ADD CONSTRAINT table_131_parent_fkey FOREIGN KEY (table_130_id) REFERENCES app.table_130(id);
ALTER TABLE ONLY app.table_132 ADD CONSTRAINT table_132_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_132 ADD CONSTRAINT table_132_parent_fkey FOREIGN KEY (table_131_id) REFERENCES app.table_131(id);
ALTER TABLE ONLY app.table_133 ADD CONSTRAINT table_133_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_133 ADD CONSTRAINT table_133_parent_fkey FOREIGN KEY (table_132_id) REFERENCES app.table_132(id);
ALTER TABLE ONLY app.table_134 ADD CONSTRAINT table_134_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_134 ADD CONSTRAINT table_134_parent_fkey FOREIGN KEY (table_133_id) REFERENCES app.table_133(id);
ALTER TABLE ONLY app.table_135 ADD CONSTRAINT table_135_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_135 ADD CONSTRAINT table_135_parent_fkey FOREIGN KEY (table_134_id) REFERENCES app.table_134(id);
ALTER TABLE ONLY app.table_136 ADD CONSTRAINT table_136_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_136 ADD CONSTRAINT table_136_parent_fkey FOREIGN KEY (table_135_id) REFERENCES app.table_135(id);
ALTER TABLE ONLY app.table_137 ADD CONSTRAINT table_137_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_137 ADD CONSTRAINT table_137_parent_fkey FOREIGN KEY (table_136_id) REFERENCES app.table_136(id);
ALTER TABLE ONLY app.table_138 ADD CONSTRAINT table_138_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_138 ADD CONSTRAINT table_138_parent_fkey FOREIGN KEY (table_137_id) REFERENCES app.table_137(id);
ALTER TABLE ONLY app.table_139 ADD CONSTRAINT table_139_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_139 ADD CONSTRAINT table_139_parent_fkey FOREIGN KEY (table_138_id) REFERENCES app.table_138(id);
ALTER TABLE ONLY app.table_140 ADD CONSTRAINT table_140_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_140 ADD CONSTRAINT table_140_parent_fkey FOREIGN KEY (table_139_id) REFERENCES app.table_139(id);
ALTER TABLE ONLY app.table_141 ADD CONSTRAINT table_141_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_141 ADD CONSTRAINT table_141_parent_fkey FOREIGN KEY (table_140_id) REFERENCES app.table_140(id);
ALTER TABLE ONLY app.table_142 ADD CONSTRAINT table_142_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_142 ADD CONSTRAINT table_142_parent_fkey FOREIGN KEY (table_141_id) REFERENCES app.table_141(id);
ALTER TABLE ONLY app.table_143 ADD CONSTRAINT table_143_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_143 ADD CONSTRAINT table_143_parent_fkey FOREIGN KEY (table_142_id) REFERENCES app.table_142(id);
ALTER TABLE ONLY app.table_144 ADD CONSTRAINT table_144_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_144 ADD CONSTRAINT table_144_parent_fkey FOREIGN KEY (table_143_id) REFERENCES app.table_143(id);
ALTER TABLE ONLY app.table_145 ADD CONSTRAINT table_145_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_145 ADD CONSTRAINT table_145_parent_fkey FOREIGN KEY (table_144_id) REFERENCES app.table_144(id);
ALTER TABLE ONLY app.table_146 ADD CONSTRAINT table_146_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_146 ADD CONSTRAINT table_146_parent_fkey FOREIGN KEY (table_145_id) REFERENCES app.table_145(id);
ALTER TABLE ONLY app.table_147 ADD CONSTRAINT table_147_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_147 ADD CONSTRAINT table_147_parent_fkey FOREIGN KEY (table_146_id) REFERENCES app.table_146(id);
ALTER TABLE ONLY app.table_148 ADD CONSTRAINT table_148_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_148 ADD CONSTRAINT table_148_parent_fkey FOREIGN KEY (table_147_id) REFERENCES app.table_147(id);
ALTER TABLE ONLY app.table_149 ADD CONSTRAINT table_149_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_149 ADD CONSTRAINT table_149_parent_fkey FOREIGN KEY (table_148_id) REFERENCES app.table_148(id);
ALTER TABLE ONLY app.table_150 ADD CONSTRAINT table_150_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_150 ADD CONSTRAINT table_150_parent_fkey FOREIGN KEY (table_149_id) REFERENCES app.table_149(id);
ALTER TABLE ONLY app.table_151 ADD CONSTRAINT table_151_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_151 ADD CONSTRAINT table_151_parent_fkey FOREIGN KEY (table_150_id) REFERENCES app.table_150(id);
ALTER TABLE ONLY app.table_152 ADD CONSTRAINT table_152_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_152 ADD CONSTRAINT table_152_parent_fkey FOREIGN KEY (table_151_id) REFERENCES app.table_151(id);
ALTER TABLE ONLY app.table_153 ADD CONSTRAINT table_153_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_153 ADD CONSTRAINT table_153_parent_fkey FOREIGN KEY (table_152_id) REFERENCES app.table_152(id);
ALTER TABLE ONLY app.table_154 ADD CONSTRAINT table_154_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_154 ADD CONSTRAINT table_154_parent_fkey FOREIGN KEY (table_153_id) REFERENCES app.table_153(id);
ALTER TABLE ONLY app.table_155 ADD CONSTRAINT table_155_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_155 ADD CONSTRAINT table_155_parent_fkey FOREIGN KEY (table_154_id) REFERENCES app.table_154(id);
ALTER TABLE ONLY app.table_156 ADD CONSTRAINT table_156_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_156 ADD CONSTRAINT table_156_parent_fkey FOREIGN KEY (table_155_id) REFERENCES app.table_155(id);
ALTER TABLE ONLY app.table_157 ADD CONSTRAINT table_157_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_157 ADD CONSTRAINT table_157_parent_fkey FOREIGN KEY (table_156_id) REFERENCES app.table_156(id);
ALTER TABLE ONLY app.table_158 ADD CONSTRAINT table_158_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_158 ADD CONSTRAINT table_158_parent_fkey FOREIGN KEY (table_157_id) REFERENCES app.table_157(id);
ALTER TABLE ONLY app.table_159 ADD CONSTRAINT table_159_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_159 ADD CONSTRAINT table_159_parent_fkey FOREIGN KEY (table_158_id) REFERENCES app.table_158(id);
ALTER TABLE ONLY app.table_160 ADD CONSTRAINT table_160_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_160 ADD CONSTRAINT table_160_parent_fkey FOREIGN KEY (table_159_id) REFERENCES app.table_159(id);
ALTER TABLE ONLY app.table_161 ADD CONSTRAINT table_161_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_161 ADD CONSTRAINT table_161_parent_fkey FOREIGN KEY (table_160_id) REFERENCES app.table_160(id);
ALTER TABLE ONLY app.table_162 ADD CONSTRAINT table_162_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_162 ADD CONSTRAINT table_162_parent_fkey FOREIGN KEY (table_161_id) REFERENCES app.table_161(id);
ALTER TABLE ONLY app.table_163 ADD CONSTRAINT table_163_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_163 ADD CONSTRAINT table_163_parent_fkey FOREIGN KEY (table_162_id) REFERENCES app.table_162(id);
ALTER TABLE ONLY app.table_164 ADD CONSTRAINT table_164_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_164 ADD CONSTRAINT table_164_parent_fkey FOREIGN KEY (table_163_id) REFERENCES app.table_163(id);
ALTER TABLE ONLY app.table_165 ADD CONSTRAINT table_165_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_165 ADD CONSTRAINT table_165_parent_fkey FOREIGN KEY (table_164_id) REFERENCES app.table_164(id);
ALTER TABLE ONLY app.table_166 ADD CONSTRAINT table_166_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_166 ADD CONSTRAINT table_166_parent_fkey FOREIGN KEY (table_165_id) REFERENCES app.table_165(id);
ALTER TABLE ONLY app.table_167 ADD CONSTRAINT table_167_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_167 ADD CONSTRAINT table_167_parent_fkey FOREIGN KEY (table_166_id) REFERENCES app.table_166(id);
ALTER TABLE ONLY app.table_168 ADD CONSTRAINT table_168_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_168 ADD CONSTRAINT table_168_parent_fkey FOREIGN KEY (table_167_id) REFERENCES app.table_167(id);
ALTER TABLE ONLY app.table_169 ADD CONSTRAINT table_169_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_169 ADD CONSTRAINT table_169_parent_fkey FOREIGN KEY (table_168_id) REFERENCES app.table_168(id);
ALTER TABLE ONLY app.table_170 ADD CONSTRAINT table_170_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_170 ADD CONSTRAINT table_170_parent_fkey FOREIGN KEY (table_169_id) REFERENCES app.table_169(id);
ALTER TABLE ONLY app.table_171 ADD CONSTRAINT table_171_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_171 ADD CONSTRAINT table_171_parent_fkey FOREIGN KEY (table_170_id) REFERENCES app.table_170(id);
ALTER TABLE ONLY app.table_172 ADD CONSTRAINT table_172_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_172 ADD CONSTRAINT table_172_parent_fkey FOREIGN KEY (table_171_id) REFERENCES app.table_171(id);
ALTER TABLE ONLY app.table_173 ADD CONSTRAINT table_173_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_173 ADD CONSTRAINT table_173_parent_fkey FOREIGN KEY (table_172_id) REFERENCES app.table_172(id);
ALTER TABLE ONLY app.table_174 ADD CONSTRAINT table_174_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_174 ADD CONSTRAINT table_174_parent_fkey FOREIGN KEY (table_173_id) REFERENCES app.table_173(id);
ALTER TABLE ONLY app.table_175 ADD CONSTRAINT table_175_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_175 ADD CONSTRAINT table_175_parent_fkey FOREIGN KEY (table_174_id) REFERENCES app.table_174(id);
ALTER TABLE ONLY app.table_176 ADD CONSTRAINT table_176_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_176 ADD CONSTRAINT table_176_parent_fkey FOREIGN KEY (table_175_id) REFERENCES app.table_175(id);
ALTER TABLE ONLY app.table_177 ADD CONSTRAINT table_177_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_177 ADD CONSTRAINT table_177_parent_fkey FOREIGN KEY (table_176_id) REFERENCES app.table_176(id);
ALTER TABLE ONLY app.table_178 ADD CONSTRAINT table_178_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_178 ADD CONSTRAINT table_178_parent_fkey FOREIGN KEY (table_177_id) REFERENCES app.table_177(id);
ALTER TABLE ONLY app.table_179 ADD CONSTRAINT table_179_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_179 ADD CONSTRAINT table_179_parent_fkey FOREIGN KEY (table_178_id) REFERENCES app.table_178(id);
ALTER TABLE ONLY app.table_180 ADD CONSTRAINT table_180_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_180 ADD CONSTRAINT table_180_parent_fkey FOREIGN KEY (table_179_id) REFERENCES app.table_179(id);
ALTER TABLE ONLY app.table_181 ADD CONSTRAINT table_181_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_181 ADD CONSTRAINT table_181_parent_fkey FOREIGN KEY (table_180_id) REFERENCES app.table_180(id);
ALTER TABLE ONLY app.table_182 ADD CONSTRAINT table_182_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_182 ADD CONSTRAINT table_182_parent_fkey FOREIGN KEY (table_181_id) REFERENCES app.table_181(id);
ALTER TABLE ONLY app.table_183 ADD CONSTRAINT table_183_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_183 ADD CONSTRAINT table_183_parent_fkey FOREIGN KEY (table_182_id) REFERENCES app.table_182(id);
ALTER TABLE ONLY app.table_184 ADD CONSTRAINT table_184_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_184 ADD CONSTRAINT table_184_parent_fkey FOREIGN KEY (table_183_id) REFERENCES app.table_183(id);
ALTER TABLE ONLY app.table_185 ADD CONSTRAINT table_185_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_185 ADD CONSTRAINT table_185_parent_fkey FOREIGN KEY (table_184_id) REFERENCES app.table_184(id);
ALTER TABLE ONLY app.table_186 ADD CONSTRAINT table_186_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_186 ADD CONSTRAINT table_186_parent_fkey FOREIGN KEY (table_185_id) REFERENCES app.table_185(id);
ALTER TABLE ONLY app.table_187 ADD CONSTRAINT table_187_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_187 ADD CONSTRAINT table_187_parent_fkey FOREIGN KEY (table_186_id) REFERENCES app.table_186(id);
ALTER TABLE ONLY app.table_188 ADD CONSTRAINT table_188_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_188 ADD CONSTRAINT table_188_parent_fkey FOREIGN KEY (table_187_id) REFERENCES app.table_187(id);
ALTER TABLE ONLY app.table_189 ADD CONSTRAINT table_189_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_189 ADD CONSTRAINT table_189_parent_fkey FOREIGN KEY (table_188_id) REFERENCES app.table_188(id);
ALTER TABLE ONLY app.table_190 ADD CONSTRAINT table_190_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_190 ADD CONSTRAINT table_190_parent_fkey FOREIGN KEY (table_189_id) REFERENCES app.table_189(id);
ALTER TABLE ONLY app.table_191 ADD CONSTRAINT table_191_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_191 ADD CONSTRAINT table_191_parent_fkey FOREIGN KEY (table_190_id) REFERENCES app.table_190(id);
ALTER TABLE ONLY app.table_192 ADD CONSTRAINT table_192_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_192 ADD CONSTRAINT table_192_parent_fkey FOREIGN KEY (table_191_id) REFERENCES app.table_191(id);
ALTER TABLE ONLY app.table_193 ADD CONSTRAINT table_193_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_193 ADD CONSTRAINT table_193_parent_fkey FOREIGN KEY (table_192_id) REFERENCES app.table_192(id);
ALTER TABLE ONLY app.table_194 ADD CONSTRAINT table_194_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_194 ADD CONSTRAINT table_194_parent_fkey FOREIGN KEY (table_193_id) REFERENCES app.table_193(id);
ALTER TABLE ONLY app.table_195 ADD CONSTRAINT table_195_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_195 ADD CONSTRAINT table_195_parent_fkey FOREIGN KEY (table_194_id) REFERENCES app.table_194(id);
ALTER TABLE ONLY app.table_196 ADD CONSTRAINT table_196_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_196 ADD CONSTRAINT table_196_parent_fkey FOREIGN KEY (table_195_id) REFERENCES app.table_195(id);
ALTER TABLE ONLY app.table_197 ADD CONSTRAINT table_197_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_197 ADD CONSTRAINT table_197_parent_fkey FOREIGN KEY (table_196_id) REFERENCES app.table_196(id);
ALTER TABLE ONLY app.table_198 ADD CONSTRAINT table_198_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_198 ADD CONSTRAINT table_198_parent_fkey FOREIGN KEY (table_197_id) REFERENCES app.table_197(id);
ALTER TABLE ONLY app.table_199 ADD CONSTRAINT table_199_pkey PRIMARY KEY (id);
ALTER TABLE ONLY app.table_199 ADD CONSTRAINT table_199_parent_fkey FOREIGN KEY (table_198_id) REFERENCES app.table_198(id);
