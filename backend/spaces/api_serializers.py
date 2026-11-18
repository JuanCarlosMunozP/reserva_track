from rest_framework import serializers
from users.models import User
from common.security import SanitizedSerializerMixin

from .models import Space, SpaceResponsibility


class SpaceSerializer(SanitizedSerializerMixin, serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    responsible_names = serializers.SerializerMethodField()

    class Meta:
        model = Space
        fields = (
            "id", "name", "description", "category", "category_label",
            "capacity", "location", "place", "is_active", "responsible_names",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_responsible_names(self, instance):
        return [
            f"{item.user.first_name} {item.user.last_name}".strip()
            for item in instance.responsibilities.filter(is_active=True).select_related("user")
        ]

    def validate(self, attrs):
        place = attrs.get("place", getattr(self.instance, "place", None))
        location = attrs.get("location", getattr(self.instance, "location", ""))
        if place is None and not location:
            raise serializers.ValidationError(
                {"location": "Indica la ubicación (texto) o selecciona una ubicación del catálogo."}
            )
        if place is not None and not location:
            attrs["location"] = str(place)[:200]
        return attrs

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("La capacidad debe ser al menos 1.")
        return value


class SpaceResponsibilitySerializer(SanitizedSerializerMixin, serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    space_name = serializers.CharField(source="space.name", read_only=True)

    class Meta:
        model = SpaceResponsibility
        fields = ("id", "user", "user_name", "space", "space_name", "assignment_date", "is_active")
        read_only_fields = ("id", "assignment_date")

    def validate(self, attrs):
        assigned_user = attrs.get("user", getattr(self.instance, "user", None))
        assigned_space = attrs.get("space", getattr(self.instance, "space", None))
        if assigned_user is None or assigned_user.role != User.Role.USER:
            raise serializers.ValidationError({"user": "El responsable debe ser un usuario activo."})
        if not assigned_user.is_active:
            raise serializers.ValidationError({"user": "El responsable debe estar activo."})

        request = self.context.get("request")
        actor = getattr(request, "user", None)
        if (
            isinstance(actor, User)
            and actor.role == User.Role.USER
            and actor.type == User.Type.PERSONAL_ADMINISTRATOR
            and not SpaceResponsibility.objects.filter(
                user=actor,
                space=assigned_space,
                is_active=True,
            ).exists()
        ):
            raise serializers.ValidationError({"space": "Solo puedes asignar responsables en tus espacios asignados."})
        return attrs