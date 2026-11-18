"""Normaliza el catálogo geográfico (3FN) y conecta las tablas aisladas.

- City pasa a depender de Department (antes Location repetía ambos).
- Branch recibe `city` (nullable).
- Location pierde `department` y `city` (derivables vía branch → city).
- Nombres de catálogo únicos y FKs en PROTECT (nada se borra en cascada).

Los datos existentes se conservan: el departamento de cada ciudad se infiere
de sus Location; las ciudades sin Location van a "Sin departamento". Si hay
nombres duplicados que impedirían los índices únicos, aborta con un mensaje
claro en vez de perder datos.
"""
from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Department = apps.get_model("branches", "Department")
    City = apps.get_model("branches", "City")
    Branch = apps.get_model("branches", "Branch")
    Area = apps.get_model("branches", "Area")
    Location = apps.get_model("branches", "Location")

    for model in (Department, Area, Branch):
        names = list(model.objects.values_list("name", flat=True))
        dupes = {n for n in names if names.count(n) > 1}
        if dupes:
            raise RuntimeError(
                f"Nombres duplicados en {model.__name__}: {sorted(dupes)}. "
                "Fusiónalos o renómbralos antes de migrar."
            )

    fallback = None
    for city in City.objects.all():
        loc = Location.objects.filter(city=city).first()
        if loc is not None:
            city.department_id = loc.department_id
        else:
            if fallback is None:
                fallback, _ = Department.objects.get_or_create(name="Sin departamento")
            city.department_id = fallback.pk
        city.save(update_fields=["department"])

    for branch in Branch.objects.all():
        loc = Location.objects.filter(branch=branch).first()
        if loc is not None:
            branch.city_id = loc.city_id
            branch.save(update_fields=["city"])

    pairs = [(c.department_id, c.name) for c in City.objects.all()]
    if len(pairs) != len(set(pairs)):
        raise RuntimeError("Ciudades duplicadas dentro de un mismo departamento.")


class Migration(migrations.Migration):

    dependencies = [("branches", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="city",
            name="department",
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name="cities", to="branches.department",
            ),
        ),
        migrations.AddField(
            model_name="branch",
            name="city",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name="branches", to="branches.city",
            ),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="city",
            name="department",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="cities", to="branches.department",
            ),
        ),
        migrations.RemoveField(model_name="location", name="department"),
        migrations.RemoveField(model_name="location", name="city"),
        migrations.AlterField(
            model_name="location",
            name="branch",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="locations", to="branches.branch",
            ),
        ),
        migrations.AlterField(
            model_name="location",
            name="area",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="locations", to="branches.area",
            ),
        ),
        migrations.AlterField(
            model_name="department",
            name="name",
            field=models.CharField(max_length=100, unique=True, verbose_name="Department"),
        ),
        migrations.AlterField(
            model_name="area",
            name="name",
            field=models.CharField(max_length=100, unique=True, verbose_name="Area"),
        ),
        migrations.AlterField(
            model_name="branch",
            name="name",
            field=models.CharField(max_length=100, unique=True, verbose_name="Branch"),
        ),
        migrations.AddConstraint(
            model_name="city",
            constraint=models.UniqueConstraint(
                fields=("department", "name"), name="unique_city_per_department"
            ),
        ),
        migrations.AddConstraint(
            model_name="location",
            constraint=models.UniqueConstraint(
                fields=("branch", "area", "detail"), name="unique_location"
            ),
        ),
    ]
