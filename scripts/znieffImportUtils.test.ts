import assert from "node:assert/strict";
import test from "node:test";
import {
  extractScientificName,
  parseSemicolonCsvLine,
  prepareZnieffSpeciesRow,
  validateZnieffHeaders,
} from "./znieffImportUtils";

const header = parseSemicolonCsvLine(
  '"id_espece";"id_znieff";"nm_sffzn";"cd_ref";"cd_nom";"fg_conf";"fg_esp";"st_vsd";"fg_supp";"date_crea";"date_supp";"date_modif";"groupe_taxo";"nom_cite";"id_sinp"',
);
const indexes = validateZnieffHeaders(header);

test("extrait le nom scientifique balisé sans l'autorité taxonomique", () => {
  assert.deepEqual(
    extractScientificName("<i>Lutra lutra</i> (Linnaeus, 1758)"),
    {
      scientificName: "Lutra lutra",
      citedName: "Lutra lutra (Linnaeus, 1758)",
    },
  );
});

test("importe une espèce active avec son statut de déterminance", () => {
  const row = prepareZnieffSpeciesRow(
    parseSemicolonCsvLine(
      '"1";"2";"130000001";"60577";"60577";"false";"D";"3";"false";"2020-01-01";;;"Mammifères";"<i>Lutra lutra</i> (Linnaeus, 1758)";"uuid"',
    ),
    indexes,
  );
  assert.equal(row?.zoneCode, "130000001");
  assert.equal(row?.scientificName, "Lutra lutra");
  assert.equal(row?.determinationStatus, "D");
});

test("refuse les lignes supprimées, confidentielles et aux statuts inconnus", () => {
  for (const [status, suppressed] of [
    ["D", "true"],
    ["C", "false"],
    ["?", "false"],
  ]) {
    const row = prepareZnieffSpeciesRow(
      parseSemicolonCsvLine(
        `"1";"2";"130000001";"60577";"60577";"false";"${status}";"3";"${suppressed}";"2020-01-01";;;"Mammifères";"<i>Lutra lutra</i>";"uuid"`,
      ),
      indexes,
    );
    assert.equal(row, null);
  }
});

test("échoue explicitement si le format officiel change", () => {
  assert.throws(
    () => validateZnieffHeaders(["nm_sffzn", "nom_cite"]),
    /Colonnes ZNIEFF manquantes/,
  );
});